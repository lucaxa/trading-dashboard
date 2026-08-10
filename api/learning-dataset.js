/*
===========================================================
TradeMind Pro
V11.1 LEARNING DATASET ENGINE
===========================================================

Purpose:
- Build a larger historical learning dataset
- Fetch INDstocks historical candles in <= 7-day chunks
- Remove duplicate candles
- Calculate technical/market features
- Generate future outcomes
- Prepare data for V11.2 learning engine

IMPORTANT:
- PAPER / LEARNING DATA ONLY
- NO REAL ORDERS
- NO ORDER API USED
===========================================================
*/

export default async function handler(req, res) {

  try {

    // =====================================================
    // CONFIGURATION
    // =====================================================

    const VERSION = "V11.1";

    const INTERVAL =
      String(req.query.interval || "5minute");

    const REQUESTED_DAYS =
      Math.min(
        Math.max(
          Number(req.query.days || 30),
          1
        ),
        60
      );

    const INSTRUMENT =
      String(
        req.query.instrument ||
        "NIDX_40000001"
      );

    const BASE_URL =
      "https://api.indstocks.com";

    const TOKEN =
      process.env.INDSTOCKS_TOKEN;

    if (!TOKEN) {

      return res.status(500).json({
        success: false,
        version: VERSION,
        error: "INDSTOCKS_TOKEN is not configured",
        message:
          "Add INDSTOCKS_TOKEN to Vercel Environment Variables."
      });

    }

    // =====================================================
    // SAFETY
    // =====================================================

    const ALLOWED_INTERVALS = [
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
      "240minute"
    ];

    if (!ALLOWED_INTERVALS.includes(INTERVAL)) {

      return res.status(400).json({
        success: false,
        version: VERSION,
        error: "Unsupported interval",
        allowedIntervals: ALLOWED_INTERVALS
      });

    }

    // =====================================================
    // INTERVAL SIZE
    // =====================================================

    const INTERVAL_MINUTES = {

      "1minute": 1,
      "2minute": 2,
      "3minute": 3,
      "4minute": 4,
      "5minute": 5,
      "10minute": 10,
      "15minute": 15,
      "30minute": 30,
      "60minute": 60,
      "120minute": 120,
      "180minute": 180,
      "240minute": 240

    };

    const candleMinutes =
      INTERVAL_MINUTES[INTERVAL];

    // =====================================================
    // INDSTOCKS MAX RANGE
    //
    // Intraday intervals support max 7 days/request.
    // We deliberately use 6 days to leave a safety margin.
    // =====================================================

    const CHUNK_DAYS = 6;

    // =====================================================
    // HELPERS
    // =====================================================

    function sleep(ms) {

      return new Promise(
        resolve => setTimeout(resolve, ms)
      );

    }

    function toNumber(value) {

      const n = Number(value);

      return Number.isFinite(n)
        ? n
        : null;

    }

    function validCandle(c) {

      if (!Array.isArray(c)) {
        return false;
      }

      if (c.length < 6) {
        return false;
      }

      const [
        ts,
        open,
        high,
        low,
        close,
        volume
      ] = c;

      return (
        Number.isFinite(Number(ts)) &&
        Number.isFinite(Number(open)) &&
        Number.isFinite(Number(high)) &&
        Number.isFinite(Number(low)) &&
        Number.isFinite(Number(close)) &&
        Number.isFinite(Number(volume))
      );

    }

    function candleObject(c) {

      return {

        timestamp: Number(c[0]),

        date:
          new Date(
            Number(c[0])
          ).toISOString()
            .slice(0, 10),

        open: Number(c[1]),
        high: Number(c[2]),
        low: Number(c[3]),
        close: Number(c[4]),
        volume: Number(c[5])

      };

    }

    // =====================================================
    // INDICATORS
    // =====================================================

    function ema(values, period) {

      if (
        !Array.isArray(values) ||
        values.length < period
      ) {

        return null;

      }

      const multiplier =
        2 / (period + 1);

      let emaValue =
        values
          .slice(0, period)
          .reduce(
            (a, b) => a + b,
            0
          ) / period;

      for (
        let i = period;
        i < values.length;
        i++
      ) {

        emaValue =
          (
            values[i] -
            emaValue
          ) *
          multiplier +
          emaValue;

      }

      return emaValue;

    }

    function rsi(values, period = 14) {

      if (
        !Array.isArray(values) ||
        values.length < period + 1
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

      let avgGain =
        gains / period;

      let avgLoss =
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

        avgGain =
          (
            avgGain *
            (period - 1) +
            gain
          ) / period;

        avgLoss =
          (
            avgLoss *
            (period - 1) +
            loss
          ) / period;

      }

      if (avgLoss === 0) {
        return 100;
      }

      const rs =
        avgGain / avgLoss;

      return (
        100 -
        100 / (1 + rs)
      );

    }

    function atr(candles, period = 14) {

      if (
        candles.length <
        period + 1
      ) {

        return null;

      }

      const trs = [];

      for (
        let i = 1;
        i < candles.length;
        i++
      ) {

        const current =
          candles[i];

        const previous =
          candles[i - 1];

        const tr =
          Math.max(

            current.high -
            current.low,

            Math.abs(
              current.high -
              previous.close
            ),

            Math.abs(
              current.low -
              previous.close
            )

          );

        trs.push(tr);

      }

      if (trs.length < period) {
        return null;
      }

      let value =
        trs
          .slice(0, period)
          .reduce(
            (a, b) => a + b,
            0
          ) / period;

      for (
        let i = period;
        i < trs.length;
        i++
      ) {

        value =
          (
            value *
            (period - 1) +
            trs[i]
          ) / period;

      }

      return value;

    }

    function vwap(candles) {

      let pv = 0;
      let volume = 0;

      for (
        const c of candles
      ) {

        const typical =
          (
            c.high +
            c.low +
            c.close
          ) / 3;

        pv +=
          typical *
          c.volume;

        volume +=
          c.volume;

      }

      if (volume === 0) {
        return null;
      }

      return pv / volume;

    }

    // =====================================================
    // FETCH HISTORICAL DATA
    // =====================================================

    async function fetchHistorical(
      startMs,
      endMs
    ) {

      const url =
        `${BASE_URL}/market/historical/${INTERVAL}` +
        `?scrip-codes=${encodeURIComponent(INSTRUMENT)}` +
        `&start_time=${startMs}` +
        `&end_time=${endMs}`;

      const response =
        await fetch(
          url,
          {
            method: "GET",
            headers: {
              "Authorization": TOKEN,
              "Content-Type":
                "application/json"
            }
          }
        );

      const text =
        await response.text();

      let data;

      try {

        data =
          JSON.parse(text);

      } catch {

        throw new Error(
          `INDstocks returned non-JSON response: ${text.slice(0, 300)}`
        );

      }

      if (!response.ok) {

        throw new Error(
          `INDstocks HTTP ${response.status}: ` +
          JSON.stringify(data)
        );

      }

      /*
       Expected:
       {
         status: "success",
         data: {
           candles: [...]
         }
       }
      */

      let candles = [];

      if (
        data &&
        data.data &&
        Array.isArray(
          data.data.candles
        )
      ) {

        candles =
          data.data.candles;

      } else if (
        data &&
        Array.isArray(data.candles)
      ) {

        candles =
          data.candles;

      }

      return candles;

    }

    // =====================================================
    // DETERMINE TIME RANGE
    // =====================================================

    const now =
      Date.now();

    const requestedStart =
      now -
      REQUESTED_DAYS *
      24 *
      60 *
      60 *
      1000;

    // =====================================================
    // FETCH IN CHUNKS
    // =====================================================

    const allRawCandles = [];

    let chunkEnd = now;

    let chunksRequested = 0;

    const chunkMs =
      CHUNK_DAYS *
      24 *
      60 *
      60 *
      1000;

    while (
      chunkEnd >
      requestedStart
    ) {

      const chunkStart =
        Math.max(
          requestedStart,
          chunkEnd - chunkMs
        );

      chunksRequested++;

      try {

        const candles =
          await fetchHistorical(
            chunkStart,
            chunkEnd
          );

        allRawCandles.push(
          ...candles
        );

      } catch (error) {

        return res.status(502).json({

          success: false,

          version: VERSION,

          error:
            "Historical data fetch failed",

          details:
            error.message,

          chunk: {
            start:
              new Date(
                chunkStart
              ).toISOString(),

            end:
              new Date(
                chunkEnd
              ).toISOString()
          }

        });

      }

      /*
       Small delay between requests.
       This avoids hammering the API.
      */

      await sleep(150);

      chunkEnd =
        chunkStart;

    }

    // =====================================================
    // CLEAN CANDLES
    // =====================================================

    const validRaw =
      allRawCandles
        .filter(validCandle);

    const candlesMap =
      new Map();

    for (
      const c of validRaw
    ) {

      const obj =
        candleObject(c);

      candlesMap.set(
        obj.timestamp,
        obj
      );

    }

    const candles =
      Array.from(
        candlesMap.values()
      )
      .sort(
        (a, b) =>
          a.timestamp -
          b.timestamp
      );

    // =====================================================
    // DATA QUALITY
    // =====================================================

    const duplicateCandles =
      validRaw.length -
      candles.length;

    const invalidCandles =
      allRawCandles.length -
      validRaw.length;

    // =====================================================
    // TRADING DAYS
    // =====================================================

    const tradingDaySet =
      new Set(
        candles.map(
          c => c.date
        )
      );

    const tradingDays =
      tradingDaySet.size;

    // =====================================================
    // FEATURE DATASET
    // =====================================================

    const rows = [];

    /*
      We need enough history for
      EMA21 + RSI14 + ATR14.
    */

    const LOOKBACK = 40;

    /*
      Future horizon:
      12 candles = 60 minutes
      for 5-minute data.
    */

    const FUTURE_CANDLES = 12;

    for (
      let i = LOOKBACK;
      i <
      candles.length -
      FUTURE_CANDLES;
      i++
    ) {

      const current =
        candles[i];

      const history =
        candles.slice(
          0,
          i + 1
        );

      const closes =
        history.map(
          c => c.close
        );

      const ema9 =
        ema(
          closes,
          9
        );

      const ema21 =
        ema(
          closes,
          21
        );

      const previousCloses =
        closes.slice(
          0,
          -1
        );

      const previousEMA9 =
        ema(
          previousCloses,
          9
        );

      const previousEMA21 =
        ema(
          previousCloses,
          21
        );

      const ema9Slope =
        (
          ema9 -
          previousEMA9
        );

      const ema21Slope =
        (
          ema21 -
          previousEMA21
        );

      const rsi14 =
        rsi(
          closes,
          14
        );

      const previousRSI =
        rsi(
          previousCloses,
          14
        );

      const atr14 =
        atr(
          history,
          14
        );

      const currentVWAP =
        vwap(
          history
        );

      if (
        ema9 === null ||
        ema21 === null ||
        rsi14 === null ||
        atr14 === null ||
        currentVWAP === null
      ) {

        continue;

      }

      // ===================================================
      // PRICE / EMA FEATURES
      // ===================================================

      const emaSpread =
        ema9 -
        ema21;

      const emaSpreadATR =
        atr14 !== 0
          ? emaSpread / atr14
          : 0;

      const ema9SlopeATR =
        atr14 !== 0
          ? ema9Slope / atr14
          : 0;

      const ema21SlopeATR =
        atr14 !== 0
          ? ema21Slope / atr14
          : 0;

      const ema9Distance =
        current.close -
        ema9;

      const ema21Distance =
        current.close -
        ema21;

      const ema9DistanceATR =
        atr14 !== 0
          ? ema9Distance / atr14
          : 0;

      const ema21DistanceATR =
        atr14 !== 0
          ? ema21Distance / atr14
          : 0;

      const vwapDistance =
        current.close -
        currentVWAP;

      const vwapDistanceATR =
        atr14 !== 0
          ? vwapDistance / atr14
          : 0;

      // ===================================================
      // CANDLE FEATURES
      // ===================================================

      const range =
        current.high -
        current.low;

      const body =
        Math.abs(
          current.close -
          current.open
        );

      const bodyRatio =
        range > 0
          ? body / range
          : 0;

      const upperWick =
        current.high -
        Math.max(
          current.open,
          current.close
        );

      const lowerWick =
        Math.min(
          current.open,
          current.close
        ) -
        current.low;

      const upperWickRatio =
        range > 0
          ? upperWick / range
          : 0;

      const lowerWickRatio =
        range > 0
          ? lowerWick / range
          : 0;

      const closeLocation =
        range > 0
          ? (
              current.close -
              current.low
            ) / range
          : 0.5;

      const bullish =
        current.close >
        current.open;

      const bearish =
        current.close <
        current.open;

      // ===================================================
      // MARKET TREND
      // ===================================================

      let trend = "SIDEWAYS";

      if (
        ema9 > ema21 &&
        ema9Slope > 0 &&
        ema21Slope > 0
      ) {

        trend =
          "BULLISH";

      } else if (
        ema9 < ema21 &&
        ema9Slope < 0 &&
        ema21Slope < 0
      ) {

        trend =
          "BEARISH";

      }

      // ===================================================
      // REGIME
      // ===================================================

      let regime =
        "RANGING";

      const normalizedSpread =
        Math.abs(
          emaSpreadATR
        );

      const normalizedSlope =
        Math.max(
          Math.abs(
            ema9SlopeATR
          ),
          Math.abs(
            ema21SlopeATR
          )
        );

      if (
        normalizedSpread >= 0.8 &&
        normalizedSlope >= 0.15
      ) {

        regime =
          "TRENDING";

      } else if (
        normalizedSpread >= 0.4
      ) {

        regime =
          "TRANSITION";

      }

      // ===================================================
      // TIME FEATURES
      // ===================================================

      const date =
        new Date(
          current.timestamp
        );

      /*
       INDstocks timestamps are documented
       as IST. We use the timestamp fields
       conservatively for the learning dataset.
      */

      const hour =
        date.getUTCHours();

      const minute =
        date.getUTCMinutes();

      /*
       Approximate Indian-market session
       from 09:15 IST.
      */

      const minutesFromOpen =
        (
          hour * 60 +
          minute
        ) -
        (
          9 * 60 +
          15
        );

      // ===================================================
      // FUTURE OUTCOME
      // ===================================================

      const future =
        candles.slice(
          i + 1,
          i + 1 +
          FUTURE_CANDLES
        );

      const entry =
        current.close;

      /*
       Risk model intentionally simple
       for the learning dataset.

       ATR-based:
       stop = 1 ATR
       target = 2 ATR
      */

      const risk =
        atr14;

      const reward =
        atr14 * 2;

      const buyStop =
        entry -
        risk;

      const buyTarget =
        entry +
        reward;

      const sellStop =
        entry +
        risk;

      const sellTarget =
        entry -
        reward;

      let buyOutcome =
        "TIMEOUT";

      let sellOutcome =
        "TIMEOUT";

      let buyWin =
        false;

      let sellWin =
        false;

      let buyLoss =
        false;

      let sellLoss =
        false;

      let maxFavorableBuy =
        0;

      let maxAdverseBuy =
        0;

      let maxFavorableSell =
        0;

      let maxAdverseSell =
        0;

      for (
        const f of future
      ) {

        maxFavorableBuy =
          Math.max(
            maxFavorableBuy,
            f.high -
            entry
          );

        maxAdverseBuy =
          Math.max(
            maxAdverseBuy,
            entry -
            f.low
          );

        maxFavorableSell =
          Math.max(
            maxFavorableSell,
            entry -
            f.low
          );

        maxAdverseSell =
          Math.max(
            maxAdverseSell,
            f.high -
            entry
          );

        /*
         For learning labels we use
         conservative stop-first logic
         if both levels occur in the
         same candle.
        */

        if (
          buyOutcome ===
          "TIMEOUT"
        ) {

          const hitStop =
            f.low <=
            buyStop;

          const hitTarget =
            f.high >=
            buyTarget;

          if (
            hitStop &&
            hitTarget
          ) {

            buyOutcome =
              "LOSS";

          } else if (
            hitStop
          ) {

            buyOutcome =
              "LOSS";

          } else if (
            hitTarget
          ) {

            buyOutcome =
              "WIN";

          }

        }

        if (
          sellOutcome ===
          "TIMEOUT"
        ) {

          const hitStop =
            f.high >=
            sellStop;

          const hitTarget =
            f.low <=
            sellTarget;

          if (
            hitStop &&
            hitTarget
          ) {

            sellOutcome =
              "LOSS";

          } else if (
            hitStop
          ) {

            sellOutcome =
              "LOSS";

          } else if (
            hitTarget
          ) {

            sellOutcome =
              "WIN";

          }

        }

      }

      buyWin =
        buyOutcome ===
        "WIN";

      sellWin =
        sellOutcome ===
        "WIN";

      buyLoss =
        buyOutcome ===
        "LOSS";

      sellLoss =
        sellOutcome ===
        "LOSS";

      // ===================================================
      // LABEL
      // ===================================================

      let preferredDirection =
        "NONE";

      let label =
        "NO_TRADE";

      if (
        buyWin &&
        !sellWin
      ) {

        preferredDirection =
          "BUY";

        label =
          "BUY_WIN";

      } else if (
        sellWin &&
        !buyWin
      ) {

        preferredDirection =
          "SELL";

        label =
          "SELL_WIN";

      } else if (
        buyLoss &&
        sellLoss
      ) {

        label =
          "BOTH_LOSS";

      }

      // ===================================================
      // ROW
      // ===================================================

      rows.push({

        timestamp:
          current.timestamp,

        date:
          current.date,

        open:
          current.open,

        high:
          current.high,

        low:
          current.low,

        close:
          current.close,

        volume:
          current.volume,

        ema9,

        ema21,

        emaSpread,

        emaSpreadATR,

        ema9Slope,

        ema21Slope,

        ema9SlopeATR,

        ema21SlopeATR,

        rsi14,

        previousRSI,

        rsiChange:
          rsi14 -
          previousRSI,

        atr14,

        vwap:
          currentVWAP,

        vwapDistance,

        vwapDistanceATR,

        ema9Distance,

        ema9DistanceATR,

        ema21Distance,

        ema21DistanceATR,

        range,

        rangeATR:
          atr14 !== 0
            ? range / atr14
            : 0,

        body,

        bodyRatio,

        upperWick,

        lowerWick,

        upperWickRatio,

        lowerWickRatio,

        closeLocation,

        bullish,

        bearish,

        trend,

        regime,

        hour,

        minute,

        minutesFromOpen,

        outcome: {

          entryTimestamp:
            current.timestamp,

          entryTime:
            new Date(
              current.timestamp
            ).toISOString(),

          entry,

          risk,

          reward,

          buyStop,

          buyTarget,

          sellStop,

          sellTarget,

          buyOutcome,

          sellOutcome,

          preferredDirection,

          label,

          maxFavorableBuy,

          maxAdverseBuy,

          maxFavorableSell,

          maxAdverseSell,

          futureCandles:
            future.length,

          outcomeTimestamp:
            future.length
              ? future[
                  future.length - 1
                ].timestamp
              : current.timestamp

        }

      });

    }

    // =====================================================
    // DATASET STATISTICS
    // =====================================================

    const BUY_WIN =
      rows.filter(
        r =>
          r.outcome.label ===
          "BUY_WIN"
      ).length;

    const SELL_WIN =
      rows.filter(
        r =>
          r.outcome.label ===
          "SELL_WIN"
      ).length;

    const BOTH_LOSS =
      rows.filter(
        r =>
          r.outcome.label ===
          "BOTH_LOSS"
      ).length;

    const NO_TRADE =
      rows.filter(
        r =>
          r.outcome.label ===
          "NO_TRADE"
      ).length;

    const buyWins =
      rows.filter(
        r =>
          r.outcome.buyOutcome ===
          "WIN"
      ).length;

    const buyLosses =
      rows.filter(
        r =>
          r.outcome.buyOutcome ===
          "LOSS"
      ).length;

    const buyTimeouts =
      rows.filter(
        r =>
          r.outcome.buyOutcome ===
          "TIMEOUT"
      ).length;

    const sellWins =
      rows.filter(
        r =>
          r.outcome.sellOutcome ===
          "WIN"
      ).length;

    const sellLosses =
      rows.filter(
        r =>
          r.outcome.sellOutcome ===
          "LOSS"
      ).length;

    const sellTimeouts =
      rows.filter(
        r =>
          r.outcome.sellOutcome ===
          "TIMEOUT"
      ).length;

    const buyDecisiveTrades =
      buyWins +
      buyLosses;

    const sellDecisiveTrades =
      sellWins +
      sellLosses;

    const buyWinRate =
      buyDecisiveTrades > 0
        ? (
            buyWins /
            buyDecisiveTrades
          ) * 100
        : 0;

    const sellWinRate =
      sellDecisiveTrades > 0
        ? (
            sellWins /
            sellDecisiveTrades
          ) * 100
        : 0;

    // =====================================================
    // FEATURE LIST
    // =====================================================

    const featureList = [

      "timestamp",
      "date",

      "open",
      "high",
      "low",
      "close",
      "volume",

      "ema9",
      "ema21",
      "emaSpread",
      "emaSpreadATR",

      "ema9Slope",
      "ema21Slope",

      "ema9SlopeATR",
      "ema21SlopeATR",

      "rsi14",
      "previousRSI",
      "rsiChange",

      "atr14",

      "vwap",
      "vwapDistance",
      "vwapDistanceATR",

      "ema9Distance",
      "ema9DistanceATR",

      "ema21Distance",
      "ema21DistanceATR",

      "range",
      "rangeATR",

      "body",
      "bodyRatio",

      "upperWick",
      "lowerWick",

      "upperWickRatio",
      "lowerWickRatio",

      "closeLocation",

      "bullish",
      "bearish",

      "trend",
      "regime",

      "hour",
      "minute",
      "minutesFromOpen"

    ];

    // =====================================================
    // RESPONSE
    // =====================================================

    return res.status(200).json({

      success: true,

      version: VERSION,

      status:
        "COMPLETED",

      mode:
        "LEARNING_DATASET_ONLY",

      paperOnly:
        true,

      realOrders:
        false,

      instrument:
        "NIFTY 50",

      scripCode:
        INSTRUMENT,

      interval:
        INTERVAL,

      requestedDays:
        REQUESTED_DAYS,

      chunkDays:
        CHUNK_DAYS,

      chunksRequested,

      candlesTested:
        candles.length,

      firstCandle:
        candles.length
          ? {
              timestamp:
                candles[0]
                  .timestamp,

              time:
                new Date(
                  candles[0]
                    .timestamp
                ).toISOString(),

              date:
                candles[0].date,

              close:
                candles[0].close
            }
          : null,

      lastCandle:
        candles.length
          ? {
              timestamp:
                candles[
                  candles.length - 1
                ].timestamp,

              time:
                new Date(
                  candles[
                    candles.length - 1
                  ].timestamp
                ).toISOString(),

              date:
                candles[
                  candles.length - 1
                ].date,

              close:
                candles[
                  candles.length - 1
                ].close
            }
          : null,

      tradingDays,

      dataQuality: {

        rawCandles:
          allRawCandles.length,

        validCandles:
          validRaw.length,

        finalCandles:
          candles.length,

        duplicateCandles,

        invalidCandles,

        requestedDays:
          REQUESTED_DAYS,

        actualTradingDays:
          tradingDays

      },

      learningRows:
        rows.length,

      skippedRows:
        candles.length -
        rows.length,

      datasetStatistics: {

        totalRows:
          rows.length,

        BUY_WIN,

        SELL_WIN,

        BOTH_LOSS,

        NO_TRADE,

        buyWins,

        buyLosses,

        buyTimeouts,

        sellWins,

        sellLosses,

        sellTimeouts,

        buyDecisiveTrades,

        sellDecisiveTrades,

        buyWinRate,

        sellWinRate

      },

      featureList,

      rows

    });

  } catch (error) {

    console.error(
      "V11.1 ERROR:",
      error
    );

    return res.status(500).json({

      success: false,

      version:
        "V11.1",

      error:
        error.message,

      mode:
        "LEARNING_DATASET_ONLY",

      paperOnly:
        true,

      realOrders:
        false

    });

  }

}

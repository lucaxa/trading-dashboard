/*
===========================================================
 TradeMind Pro
 Frontend V1 — READ-ONLY DATA ADAPTER

 PURPOSE
 ----------------------------------------------------------
 This file is the boundary between the TradeMind Pro
 backend and the Frontend V1 presentation layer.

 RULES
 ----------------------------------------------------------
 - READ ONLY
 - No strategy calculations
 - No signal generation
 - No indicator calculations
 - No trading execution
 - No learning
 - No promotion
 - No parameter changes
 - No artificial evidence

 Backend / research engine remains the source of truth.
===========================================================
*/

(function () {
  "use strict";

  const API = Object.freeze({
    quotes: "/api/quotes",
    indicators: "/api/indicators",
    liveSignal: "/api/live-signal"
  });


  /*
  ---------------------------------------------------------
   Generic JSON request
  ---------------------------------------------------------
  */

  async function requestJson(endpoint) {
    try {
      const response = await fetch(endpoint, {
        method: "GET",
        cache: "no-store",
        headers: {
          Accept: "application/json"
        }
      });

      const text = await response.text();

      let payload = null;

      try {
        payload = text ? JSON.parse(text) : null;
      } catch (parseError) {
        return {
          ok: false,
          endpoint,
          error: "INVALID_JSON_RESPONSE"
        };
      }

      if (!response.ok) {
        return {
          ok: false,
          endpoint,
          status: response.status,
          payload,
          error: "HTTP_ERROR"
        };
      }

      return {
        ok: true,
        endpoint,
        status: response.status,
        payload
      };

    } catch (error) {
      return {
        ok: false,
        endpoint,
        error: "NETWORK_ERROR"
      };
    }
  }


  /*
  ---------------------------------------------------------
   Safe value helpers
  ---------------------------------------------------------
  */

  function firstDefined(...values) {
    for (const value of values) {
      if (
        value !== undefined &&
        value !== null
      ) {
        return value;
      }
    }

    return null;
  }


  function numberOrNull(value) {
    const number = Number(value);

    return Number.isFinite(number)
      ? number
      : null;
  }


  function stringOrNull(value) {
    if (
      value === undefined ||
      value === null
    ) {
      return null;
    }

    return String(value);
  }


  /*
  ---------------------------------------------------------
   Market quote normalization
  ---------------------------------------------------------
  */

  function normalizeQuotes(result) {

    if (!result || !result.ok) {
      return {
        ok: false,
        error: result?.error || "QUOTE_REQUEST_FAILED",
        source: null,
        nifty: null,
        banknifty: null
      };
    }

    const payload = result.payload || {};
    const data = payload.data || payload;

    return {
      ok: true,

      source: firstDefined(
        payload.source,
        data.source
      ),

      nifty: data.nifty
        ? {
            price: numberOrNull(
              firstDefined(
                data.nifty.price,
                data.nifty.lastPrice,
                data.nifty.ltp
              )
            ),

            change: numberOrNull(
              firstDefined(
                data.nifty.change,
                data.nifty.changeValue
              )
            ),

            changePercent: numberOrNull(
              firstDefined(
                data.nifty.changePercent,
                data.nifty.percentChange
              )
            )
          }
        : null,

      banknifty: data.banknifty
        ? {
            price: numberOrNull(
              firstDefined(
                data.banknifty.price,
                data.banknifty.lastPrice,
                data.banknifty.ltp
              )
            ),

            change: numberOrNull(
              firstDefined(
                data.banknifty.change,
                data.banknifty.changeValue
              )
            ),

            changePercent: numberOrNull(
              firstDefined(
                data.banknifty.changePercent,
                data.banknifty.percentChange
              )
            )
          }
        : null
    };
  }


  /*
  ---------------------------------------------------------
   Live signal normalization
  ---------------------------------------------------------
  */

  function normalizeLiveSignal(result) {

    if (!result || !result.ok) {
      return {
        ok: false,
        error: result?.error || "LIVE_SIGNAL_REQUEST_FAILED"
      };
    }

    const payload = result.payload || {};

    const indicators =
      payload.indicators || {};

    const referenceRisk =
      payload.referenceRisk || {};

    const signalCandle =
      payload.signalCandle || {};

    return {
      ok: true,

      success: payload.success === true,

      version: stringOrNull(
        payload.version
      ),

      strategy: stringOrNull(
        payload.strategy
      ),

      mode: stringOrNull(
        payload.mode
      ),

      instrument: stringOrNull(
        payload.instrument
      ),

      interval: stringOrNull(
        payload.interval
      ),

      status: stringOrNull(
        payload.status
      ),

      signal: stringOrNull(
        payload.signal
      ),

      reason: stringOrNull(
        payload.reason
      ),

      timestamp: stringOrNull(
        firstDefined(
          payload.timestamp,
          signalCandle.timestamp,
          signalCandle.time
        )
      ),

      signalCandle: {
        timestamp: stringOrNull(
          firstDefined(
            signalCandle.timestamp,
            signalCandle.time
          )
        ),

        open: numberOrNull(
          signalCandle.open
        ),

        high: numberOrNull(
          signalCandle.high
        ),

        low: numberOrNull(
          signalCandle.low
        ),

        close: numberOrNull(
          signalCandle.close
        )
      },

      indicators: {
        ema9: numberOrNull(
          firstDefined(
            indicators.ema9,
            indicators.EMA9
          )
        ),

        ema21: numberOrNull(
          firstDefined(
            indicators.ema21,
            indicators.EMA21
          )
        ),

        rsi14: numberOrNull(
          firstDefined(
            indicators.rsi14,
            indicators.RSI14
          )
        ),

        vwap: numberOrNull(
          indicators.vwap
        ),

        atr14: numberOrNull(
          firstDefined(
            indicators.atr14,
            indicators.ATR14
          )
        )
      },

      referenceRisk: {
        entry: numberOrNull(
          referenceRisk.entry
        ),

        stop: numberOrNull(
          referenceRisk.stop
        ),

        target: numberOrNull(
          referenceRisk.target
        ),

        risk: numberOrNull(
          referenceRisk.risk
        ),

        rewardRisk: numberOrNull(
          firstDefined(
            referenceRisk.rewardRisk,
            referenceRisk.rewardRiskRatio
          )
        )
      },

      diagnostics:
        payload.diagnostics || null
    };
  }


  /*
  ---------------------------------------------------------
   Public read-only API
  ---------------------------------------------------------
  */

  const TradeMindData = Object.freeze({

    endpoints: API,

    async getQuotes() {
      const result = await requestJson(API.quotes);

      return normalizeQuotes(result);
    },


    async getLiveSignal() {
      const result = await requestJson(API.liveSignal);

      return normalizeLiveSignal(result);
    },


    async getIndicators() {
      const result = await requestJson(API.indicators);

      if (!result.ok) {
        return {
          ok: false,
          error:
            result.error ||
            "INDICATOR_REQUEST_FAILED"
        };
      }

      return {
        ok: true,
        payload: result.payload
      };
    },


    async getDashboardData() {

      const [
        quotes,
        liveSignal
      ] = await Promise.all([
        this.getQuotes(),
        this.getLiveSignal()
      ]);

      return Object.freeze({
        quotes,
        liveSignal
      });
    }

  });


  /*
  ---------------------------------------------------------
   Expose read-only adapter
  ---------------------------------------------------------
  */

  window.TradeMindData = TradeMindData;

})();

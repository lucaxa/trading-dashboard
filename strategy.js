/*
TradeMind Pro
Strategy Engine Interface

V7 Frontend
Paper Trading Only
NO REAL ORDERS
*/

"use strict";

(function () {

    function generateTradeSignal(candle, indicators) {

        if (!candle || !indicators) {

            return {
                signal: "WAIT",
                reason: "Insufficient data",
                entry: null
            };

        }

        const price = Number(candle.c);
        const ema9 = Number(indicators.ema9);
        const ema21 = Number(indicators.ema21);
        const rsi14 = Number(indicators.rsi14);
        const vwap = Number(indicators.vwap);

        if (
            !Number.isFinite(price) ||
            !Number.isFinite(ema9) ||
            !Number.isFinite(ema21) ||
            !Number.isFinite(rsi14) ||
            !Number.isFinite(vwap)
        ) {

            return {
                signal: "WAIT",
                reason: "Insufficient indicator data",
                entry: null
            };

        }

        const bullishTrend =
            ema9 > ema21;

        const bearishTrend =
            ema9 < ema21;

        const aboveVWAP =
            price > vwap;

        const belowVWAP =
            price < vwap;

        const bullishMomentum =
            rsi14 >= 55;

        const bearishMomentum =
            rsi14 <= 45;


        if (
            bullishTrend &&
            aboveVWAP &&
            bullishMomentum
        ) {

            return {
                signal: "BUY",
                reason:
                    "EMA bullish + RSI bullish + Price above VWAP",
                entry: price
            };

        }


        if (
            bearishTrend &&
            belowVWAP &&
            bearishMomentum
        ) {

            return {
                signal: "SELL",
                reason:
                    "EMA bearish + RSI bearish + Price below VWAP",
                entry: price
            };

        }


        return {
            signal: "WAIT",
            reason:
                "Waiting for confirmation",
            entry: null
        };

    }


    // Expose strategy engine to the main application

    window.TradeMindStrategy = {

        generateSignal:
            generateTradeSignal

    };


})();

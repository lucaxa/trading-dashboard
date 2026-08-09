/*
TradeMind Pro
V1 Strategy Engine

Uses:
- EMA 9
- EMA 21
- RSI 14
- VWAP

Paper analysis only.
NO ORDERS ARE PLACED.
*/

function generateSignal(candle, indicators) {

    const price = candle.c;

    const {
        ema9,
        ema21,
        rsi14,
        vwap
    } = indicators;

    // Make sure all indicators exist
    if (
        price == null ||
        ema9 == null ||
        ema21 == null ||
        rsi14 == null ||
        vwap == null
    ) {
        return {
            signal: "HOLD",
            reason: "Insufficient indicator data"
        };
    }

    // =========================
    // BUY CONDITIONS
    // =========================

    const bullishTrend = ema9 > ema21;
    const aboveVWAP = price > vwap;
    const bullishMomentum = rsi14 > 50 && rsi14 < 70;

    if (
        bullishTrend &&
        aboveVWAP &&
        bullishMomentum
    ) {

        return {
            signal: "BUY",
            reason: "Bullish trend + above VWAP + positive RSI",

            entry: price,

            indicators: {
                ema9,
                ema21,
                rsi14,
                vwap
            }
        };
    }

    // =========================
    // SELL CONDITIONS
    // =========================

    const bearishTrend = ema9 < ema21;
    const belowVWAP = price < vwap;
    const bearishMomentum = rsi14 < 50 && rsi14 > 30;

    if (
        bearishTrend &&
        belowVWAP &&
        bearishMomentum
    ) {

        return {
            signal: "SELL",
            reason: "Bearish trend + below VWAP + negative RSI",

            entry: price,

            indicators: {
                ema9,
                ema21,
                rsi14,
                vwap
            }
        };
    }

    // =========================
    // NO TRADE
    // =========================

    return {
        signal: "HOLD",
        reason: "Conditions not aligned",

        indicators: {
            ema9,
            ema21,
            rsi14,
            vwap
        }
    };
}
const testCandle = {
    c: 24580
};

const testIndicators = {
    ema9: 24570,
    ema21: 24550,
    rsi14: 58,
    vwap: 24560
};

console.log(
    generateSignal(
        testCandle,
        testIndicators
    )
);
// =========================
// SHOW TEST RESULT ON PAGE
// =========================

document.addEventListener("DOMContentLoaded", function () {

    const testBox = document.createElement("div");

    testBox.style.cssText = `
        margin: 20px;
        padding: 20px;
        background: #161b26;
        border: 1px solid #2a3345;
        border-radius: 16px;
        color: white;
        font-family: Arial, sans-serif;
    `;

    testBox.innerHTML = `
        <h2>🧪 Strategy Engine Test</h2>

        <p>Test Price: ${testCandle.c}</p>
        <p>EMA 9: ${testIndicators.ema9}</p>
        <p>EMA 21: ${testIndicators.ema21}</p>
        <p>RSI 14: ${testIndicators.rsi14}</p>
        <p>VWAP: ${testIndicators.vwap}</p>

        <hr>

        <h2>
            Result:
            ${result.signal}
        </h2>

        <p>${result.reason}</p>
    `;

    document.body.appendChild(testBox);

});

/*
TradeMind Pro
V1 Strategy Engine

Paper Trading Only
NO REAL ORDERS
*/

(function () {

    // =========================
    // STRATEGY ENGINE
    // =========================

    function generateTradeSignal(candle, indicators) {

        const price = candle.c;

        const ema9 = indicators.ema9;
        const ema21 = indicators.ema21;
        const rsi14 = indicators.rsi14;
        const vwap = indicators.vwap;

        // Check indicator availability

        if (
            price == null ||
            ema9 == null ||
            ema21 == null ||
            rsi14 == null ||
            vwap == null
        ) {

            return {
                signal: "HOLD",
                reason: "Insufficient indicator data",
                entry: null
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
                entry: price
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
                entry: price
            };

        }

        // =========================
        // HOLD
        // =========================

        return {
            signal: "HOLD",
            reason: "Conditions not aligned",
            entry: null
        };

    }


    // =========================
    // TEST DATA
    // =========================

    const strategyTestCandle = {
    c: 24520
};

const strategyTestIndicators = {
    ema9: 24530,
    ema21: 24550,
    rsi14: 42,
    vwap: 24540
};


    // =========================
    // RUN TEST
    // =========================

    const strategyTestResult = generateTradeSignal(
        strategyTestCandle,
        strategyTestIndicators
    );


    // =========================
    // EXPOSE ENGINE
    // =========================

    window.TradeMindStrategy = {
        generateSignal: generateTradeSignal
    };


    // =========================
    // DISPLAY TEST RESULT
    // =========================

    function displayStrategyTest() {

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

            <p>
                <strong>Price:</strong>
                ${strategyTestCandle.c}
            </p>

            <p>
                <strong>EMA 9:</strong>
                ${strategyTestIndicators.ema9}
            </p>

            <p>
                <strong>EMA 21:</strong>
                ${strategyTestIndicators.ema21}
            </p>

            <p>
                <strong>RSI 14:</strong>
                ${strategyTestIndicators.rsi14}
            </p>

            <p>
                <strong>VWAP:</strong>
                ${strategyTestIndicators.vwap}
            </p>

            <hr>

            <h2>
                Result:
                ${strategyTestResult.signal}
            </h2>

            <p>
                ${strategyTestResult.reason}
            </p>

            <p>
                Strategy Engine: ACTIVE
            </p>
        `;

        document.body.appendChild(testBox);

    }


    // =========================
    // START AFTER PAGE LOAD
    // =========================

    if (document.readyState === "loading") {

        document.addEventListener(
            "DOMContentLoaded",
            displayStrategyTest
        );

    } else {

        displayStrategyTest();

    }


})();

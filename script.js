/*
TradeMind Pro
V10.1 Frontend Controller

INDstocks → Vercel
             ↓
       Live Market Data
             ↓
       Technical Indicators
             ↓
       V10.1 Historical Backtest

PAPER TRADING ONLY.
NO REAL ORDERS.
*/

"use strict";


// ======================================================
// STATE
// ======================================================

const state = {

    nifty: null,

    banknifty: null,

    indicators: null,

    backtest: null,

    connected: false,

    lastUpdate: null,

    backtestRunning: false

};


// ======================================================
// DOM HELPERS
// ======================================================

function $(id) {

    return document.getElementById(id);

}


function setText(id, value) {

    const element = $(id);

    if (!element) {

        console.warn(
            "TradeMind: element not found:",
            id
        );

        return;

    }

    element.textContent =
        value;

}


// ======================================================
// FORMATTING
// ======================================================

function formatPrice(value) {

    const number =
        Number(value);

    if (!Number.isFinite(number)) {

        return "--";

    }

    return number.toLocaleString(
        "en-IN",
        {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }
    );

}


function formatNumber(value) {

    const number =
        Number(value);

    if (!Number.isFinite(number)) {

        return "--";

    }

    return number.toFixed(2);

}


function formatPercent(value) {

    const number =
        Number(value);

    if (!Number.isFinite(number)) {

        return "--";

    }

    return `${number.toFixed(2)}%`;

}


// ======================================================
// API FETCH
// ======================================================

async function apiFetch(
    url,
    timeoutMs = 15000
) {

    console.log(
        "================================"
    );

    console.log(
        "TradeMind API REQUEST:",
        url
    );

    console.log(
        "================================"
    );


    const controller =
        new AbortController();


    const timeout =
        setTimeout(
            () => controller.abort(),
            timeoutMs
        );


    try {

        const response =
            await fetch(
                url,
                {
                    method: "GET",

                    cache: "no-store",

                    headers: {
                        "Accept":
                            "application/json",

                        "Cache-Control":
                            "no-cache"
                    },

                    signal:
                        controller.signal
                }
            );


        const text =
            await response.text();


        console.log(
            "TradeMind API HTTP:",
            response.status
        );


        console.log(
            "TradeMind API RAW:",
            text.slice(0, 3000)
        );


        let data;


        try {

            data =
                JSON.parse(text);

        }

        catch {

            throw new Error(
                `Invalid JSON response (HTTP ${response.status})`
            );

        }


        console.log(
            "TradeMind API PARSED:",
            data
        );


        if (!response.ok) {

            throw new Error(
                typeof data?.error === "string"
                    ? data.error
                    : JSON.stringify(
                        data?.error ||
                        data
                    )
            );

        }


        if (
            data &&
            data.success === false
        ) {

            throw new Error(
                typeof data.error === "string"
                    ? data.error
                    : JSON.stringify(
                        data.error ||
                        data
                    )
            );

        }


        return data;

    }

    catch (error) {

        if (
            error?.name ===
            "AbortError"
        ) {

            throw new Error(
                `Request timed out after ${timeoutMs / 1000}s`
            );

        }

        throw error;

    }

    finally {

        clearTimeout(timeout);

    }

}


// ======================================================
// PRICE EXTRACTION
// ======================================================

function extractPrice(quote) {

    if (
        typeof quote === "number"
    ) {

        return quote;

    }


    if (
        !quote ||
        typeof quote !== "object"
    ) {

        return null;

    }


    const fields = [

        "ltp",
        "last_price",
        "lastPrice",
        "price",
        "close",
        "lp",
        "last_traded_price",
        "lastTradedPrice"

    ];


    for (
        const field of fields
    ) {

        const value =
            Number(
                quote[field]
            );


        if (
            Number.isFinite(value) &&
            value > 0
        ) {

            return value;

        }

    }


    return null;

}


// ======================================================
// QUOTE EXTRACTION
// ======================================================

function extractQuotes(data) {

    if (
        Array.isArray(data)
    ) {

        return data;

    }


    if (
        !data ||
        typeof data !== "object"
    ) {

        return [];

    }


    if (
        Array.isArray(data.data)
    ) {

        return data.data;

    }


    if (
        Array.isArray(data.quotes)
    ) {

        return data.quotes;

    }


    if (
        Array.isArray(data.results)
    ) {

        return data.results;

    }


    if (
        Array.isArray(data.items)
    ) {

        return data.items;

    }


    return Object.values(data)
        .filter(
            value =>
                value &&
                typeof value === "object" &&
                !Array.isArray(value)
        );

}


// ======================================================
// FIND INSTRUMENT
// ======================================================

function findInstrument(
    quotes,
    instrument
) {

    const wanted =
        String(instrument).toLowerCase();


    return quotes.find(
        quote => {

            if (
                !quote ||
                typeof quote !== "object"
            ) {

                return false;

            }


            const text =
                JSON.stringify(
                    quote
                ).toLowerCase();


            if (
                wanted === "nifty"
            ) {

                return (

                    text.includes(
                        "40000001"
                    ) ||

                    (
                        text.includes("nifty") &&
                        !text.includes("banknifty")
                    )

                );

            }


            if (
                wanted === "banknifty"
            ) {

                return (

                    text.includes(
                        "40000003"
                    ) ||

                    text.includes(
                        "banknifty"
                    )

                );

            }


            return false;

        }
    ) || null;

}


// ======================================================
// LIVE MARKET DATA
// ======================================================

async function fetchMarketData() {

    try {

        const result =
            await apiFetch(
                `/api/quotes?_t=${Date.now()}`,
                10000
            );


        const quotes =
            extractQuotes(
                result?.data ??
                result
            );


        const niftyQuote =
            findInstrument(
                quotes,
                "nifty"
            );


        const bankQuote =
            findInstrument(
                quotes,
                "banknifty"
            );


        const niftyPrice =
            extractPrice(
                niftyQuote
            );


        const bankPrice =
            extractPrice(
                bankQuote
            );


        console.log(
            "NIFTY:",
            niftyPrice
        );


        console.log(
            "BANKNIFTY:",
            bankPrice
        );


        if (
            Number.isFinite(niftyPrice)
        ) {

            state.nifty = {

                price:
                    niftyPrice,

                previous:
                    state.nifty?.price ??
                    niftyPrice

            };

        }


        if (
            Number.isFinite(bankPrice)
        ) {

            state.banknifty = {

                price:
                    bankPrice,

                previous:
                    state.banknifty?.price ??
                    bankPrice

            };

        }


        renderMarket();


        state.connected =
            true;


        setText(
            "marketStatus",
            "LIVE"
        );


        setText(
            "dataStatus",
            "INDSTOCKS"
        );


        updateStatusDot(true);

        updateTime();

        updateBankTrend();

    }

    catch (error) {

        console.error(
            "TradeMind market error:",
            error
        );


        setText(
            "marketStatus",
            "DATA ERROR"
        );


        setText(
            "dataStatus",
            "INDSTOCKS ERROR"
        );


        updateStatusDot(false);

    }

}


// ======================================================
// MARKET RENDER
// ======================================================

function renderMarket() {

    if (state.nifty) {

        setText(
            "niftyPrice",
            formatPrice(
                state.nifty.price
            )
        );


        renderChange(
            "niftyChange",
            state.nifty.price,
            state.nifty.previous
        );

    }


    if (state.banknifty) {

        setText(
            "bankPrice",
            formatPrice(
                state.banknifty.price
            )
        );


        renderChange(
            "bankChange",
            state.banknifty.price,
            state.banknifty.previous
        );

    }

}


// ======================================================
// CHANGE
// ======================================================

function renderChange(
    elementId,
    current,
    previous
) {

    const element =
        $(elementId);


    if (!element) {

        return;

    }


    if (
        !Number.isFinite(current) ||
        !Number.isFinite(previous)
    ) {

        element.textContent =
            "Waiting for data";

        return;

    }


    const difference =
        current -
        previous;


    if (
        difference === 0
    ) {

        element.textContent =
            "No change";

        element.className =
            "change";

        return;

    }


    const percent =
        previous !== 0
            ? (
                difference /
                previous
            ) * 100
            : 0;


    const direction =
        difference > 0
            ? "▲"
            : "▼";


    element.textContent =
        `${direction} ${Math.abs(difference).toFixed(2)} (${Math.abs(percent).toFixed(2)}%)`;


    element.className =
        difference > 0
            ? "change up"
            : "change down";

}


// ======================================================
// HISTORICAL INDICATORS
// ======================================================

async function fetchIndicatorData() {

    try {

        setText(
            "analysisStatus",
            "CALCULATING"
        );


        const result =
            await apiFetch(
                `/api/indicators?interval=5minute&_t=${Date.now()}`,
                15000
            );


        state.indicators =
            result;


        const nifty =
            result?.nifty ||
            {};


        const bank =
            result?.banknifty ||
            {};


        const niftyClose =
            Number(
                nifty.lastCandle?.c
            );


        if (
            !Number.isFinite(
                state.nifty?.price
            ) &&
            Number.isFinite(
                niftyClose
            )
        ) {

            state.nifty = {

                price:
                    niftyClose,

                previous:
                    niftyClose

            };

        }


        const bankClose =
            Number(
                bank.lastCandle?.c
            );


        if (
            !Number.isFinite(
                state.banknifty?.price
            ) &&
            Number.isFinite(
                bankClose
            )
        ) {

            state.banknifty = {

                price:
                    bankClose,

                previous:
                    bankClose

            };

        }


        renderMarket();

        renderIndicators();

        analyzeMarket();

        renderV10Diagnostics();

        updateBankTrend();


        setText(
            "analysisStatus",
            "LIVE"
        );

    }

    catch (error) {

        console.error(
            "TradeMind indicator error:",
            error
        );


        setText(
            "analysisStatus",
            "INDICATOR ERROR"
        );

    }

}


// ======================================================
// INDICATORS
// ======================================================

function renderIndicators() {

    const nifty =
        state.indicators?.nifty;


    if (!nifty) {

        return;

    }


    const ema9 =
        Number(nifty.ema9);


    const ema21 =
        Number(nifty.ema21);


    const rsi =
        Number(nifty.rsi14);


    const vwap =
        Number(nifty.vwap);


    if (
        Number.isFinite(ema9) &&
        Number.isFinite(ema21)
    ) {

        const trend =
            ema9 > ema21
                ? "BULLISH"
                : ema9 < ema21
                    ? "BEARISH"
                    : "SIDEWAYS";


        setText("trend", trend);

        setText(
            "niftyTrend",
            trend
        );

    }


    if (
        Number.isFinite(rsi)
    ) {

        const momentum =
            rsi >= 60
                ? "STRONG"
                : rsi >= 50
                    ? "POSITIVE"
                    : rsi >= 40
                        ? "NEGATIVE"
                        : "WEAK";


        setText(
            "momentum",
            `${momentum} (${rsi.toFixed(1)})`
        );

    }


    const price =
        Number(
            state.nifty?.price
        );


    if (
        Number.isFinite(price) &&
        Number.isFinite(vwap)
    ) {

        setText(
            "volatility",
            price > vwap
                ? "ABOVE VWAP"
                : "BELOW VWAP"
        );

    }


    const count =
        Number(
            nifty.candleCount
        );


    if (
        Number.isFinite(count)
    ) {

        setText(
            "candleStatus",
            `${count} CANDLES`
        );

    }

}


// ======================================================
// BANKNIFTY TREND
// ======================================================

function updateBankTrend() {

    const bank =
        state.indicators?.banknifty;


    if (!bank) {

        return;

    }


    const ema9 =
        Number(bank.ema9);


    const ema21 =
        Number(bank.ema21);


    if (
        !Number.isFinite(ema9) ||
        !Number.isFinite(ema21)
    ) {

        setText(
            "bankTrend",
            "--"
        );

        return;

    }


    setText(
        "bankTrend",

        ema9 > ema21
            ? "BULLISH"
            : ema9 < ema21
                ? "BEARISH"
                : "SIDEWAYS"

    );

}


// ======================================================
// STRATEGY
// ======================================================

function analyzeMarket() {

    const nifty =
        state.indicators?.nifty;


    if (!nifty) {

        return;

    }


    const ema9 =
        Number(nifty.ema9);

    const ema21 =
        Number(nifty.ema21);

    const rsi =
        Number(nifty.rsi14);

    const vwap =
        Number(nifty.vwap);

    const atr =
        Number(nifty.atr14);

    const price =
        Number(state.nifty?.price);

    const candle =
        nifty.lastCandle || {};


    const open =
        Number(candle.o);

    const high =
        Number(candle.h);

    const low =
        Number(candle.l);

    const close =
        Number(candle.c);


    if (
        !Number.isFinite(price) ||
        !Number.isFinite(ema9) ||
        !Number.isFinite(ema21) ||
        !Number.isFinite(rsi) ||
        !Number.isFinite(vwap)
    ) {

        setText("signal", "WAIT");

        setText(
            "strategyStatus",
            "WAITING FOR DATA"
        );

        setText("buyScore", "--");

        setText("sellScore", "--");

        setText("confidence", "--");

        return;

    }


    let buyScore = 0;

    let sellScore = 0;

    const reasons = [];


    if (ema9 > ema21) {

        buyScore++;

        reasons.push(
            "EMA bullish"
        );

    }

    else if (ema9 < ema21) {

        sellScore++;

        reasons.push(
            "EMA bearish"
        );

    }


    if (
        rsi >= 55 &&
        rsi < 70
    ) {

        buyScore++;

        reasons.push(
            "RSI bullish"
        );

    }

    else if (
        rsi <= 45 &&
        rsi > 30
    ) {

        sellScore++;

        reasons.push(
            "RSI bearish"
        );

    }


    if (price > vwap) {

        buyScore++;

        reasons.push(
            "Price above VWAP"
        );

    }

    else if (price < vwap) {

        sellScore++;

        reasons.push(
            "Price below VWAP"
        );

    }


    let candleStrong = false;


    if (
        Number.isFinite(open) &&
        Number.isFinite(high) &&
        Number.isFinite(low) &&
        Number.isFinite(close)
    ) {

        if (close > open) {

            buyScore++;

            reasons.push(
                "Bullish candle"
            );

        }

        else if (close < open) {

            sellScore++;

            reasons.push(
                "Bearish candle"
            );

        }


        const range =
            high - low;


        const body =
            Math.abs(
                close - open
            );


        candleStrong =
            range > 0 &&
            body / range >= 0.50;

    }


    let signal = "WAIT";


    if (
        buyScore >= 4 &&
        buyScore > sellScore
    ) {

        signal =
            candleStrong
                ? "STRONG BUY"
                : "BUY BIAS";

    }

    else if (
        sellScore >= 4 &&
        sellScore > buyScore
    ) {

        signal =
            candleStrong
                ? "STRONG SELL"
                : "SELL BIAS";

    }

    else if (
        buyScore >= 3 &&
        buyScore > sellScore
    ) {

        signal =
            "BUY BIAS";

    }

    else if (
        sellScore >= 3 &&
        sellScore > buyScore
    ) {

        signal =
            "SELL BIAS";

    }


    const confidenceMap = {

        0: 0,
        1: 20,
        2: 40,
        3: 60,
        4: 75,
        5: 90

    };


    const maximum =
        Math.max(
            buyScore,
            sellScore
        );


    let confidence =
        confidenceMap[maximum] ?? 0;


    if (
        buyScore > 0 &&
        sellScore > 0
    ) {

        confidence =
            Math.min(
                confidence,
                60
            );

    }


    if (signal === "WAIT") {

        confidence =
            Math.min(
                confidence,
                40
            );

    }


    setText(
        "buyScore",
        buyScore
    );


    setText(
        "sellScore",
        sellScore
    );


    setText(
        "confidence",
        `${confidence}%`
    );


    const confidenceFill =
        $("confidenceFill");


    if (confidenceFill) {

        confidenceFill.style.width =
            `${confidence}%`;

    }


    setText(
        "signal",
        signal
    );


    setText(
        "signalReason",

        signal === "WAIT"
            ? "Waiting for stronger confirmation"
            : reasons.join(" + ")

    );


    setText(
        "strategyStatus",

        signal === "WAIT"
            ? "WAITING FOR CONFIRMATION"
            : "ACTIVE — PAPER ANALYSIS"

    );


    updateTradeSetup(
        price,
        signal,
        atr
    );

}


// ======================================================
// TRADE SETUP
// ======================================================

function updateTradeSetup(
    price,
    signal,
    atr
) {

    if (
        !Number.isFinite(price) ||
        signal === "WAIT"
    ) {

        setText("entry", "--");

        setText("stoploss", "--");

        setText("target", "--");

        setText("riskReward", "--");

        return;

    }


    const risk =
        Number.isFinite(atr) &&
        atr > 0
            ? atr * 1.5
            : price * 0.001;


    const reward =
        risk * 2;


    const bullish =
        signal === "BUY BIAS" ||
        signal === "STRONG BUY";


    setText(
        "entry",
        formatPrice(price)
    );


    setText(
        "stoploss",
        formatPrice(
            bullish
                ? price - risk
                : price + risk
        )
    );


    setText(
        "target",
        formatPrice(
            bullish
                ? price + reward
                : price - reward
        )
    );


    setText(
        "riskReward",
        "1 : 2.00"
    );

}


// ======================================================
// DIAGNOSTICS
// ======================================================

function renderV10Diagnostics() {

    const nifty =
        state.indicators?.nifty;


    if (!nifty) {

        return;

    }


    setText(
        "diagPrice",
        formatPrice(
            state.nifty?.price
        )
    );


    setText(
        "diagEma9",
        formatPrice(nifty.ema9)
    );


    setText(
        "diagEma21",
        formatPrice(nifty.ema21)
    );


    setText(
        "diagRsi",
        formatNumber(nifty.rsi14)
    );


    setText(
        "diagVwap",
        formatPrice(nifty.vwap)
    );


    setText(
        "diagAtr",
        formatNumber(nifty.atr14)
    );


    setText(
        "diagSwingHigh",
        formatPrice(
            nifty.swingHigh?.price ??
            nifty.swingHigh
        )
    );


    setText(
        "diagSwingLow",
        formatPrice(
            nifty.swingLow?.price ??
            nifty.swingLow
        )
    );

}


// ======================================================
// BACKTEST
// ======================================================

async function runV10Backtest() {

    if (
        state.backtestRunning
    ) {

        return;

    }


    state.backtestRunning =
        true;


    const button =
        $("runBacktestBtn");


    if (button) {

        button.disabled =
            true;

        button.textContent =
            "RUNNING V10.1...";

    }


    resetBacktestDisplay();


    setText(
        "btStatus",
        "Fetching fresh V10.1 historical data..."
    );


    setText(
        "btEngine",
        "V10.1 Historical Simulation"
    );


    try {

        /*
        CACHE BUSTER
        */

        const apiUrl =
            `/api/backtest?interval=5minute&_t=${Date.now()}`;


        console.log(
            "================================"
        );

        console.log(
            "V10.1 BACKTEST REQUEST"
        );

        console.log(
            apiUrl
        );

        console.log(
            "================================"
        );


        const result =
            await apiFetch(
                apiUrl,
                30000
            );


        console.log(
            "================================"
        );

        console.log(
            "V10.1 BACKTEST RESPONSE"
        );

        console.log(
            result
        );

        console.log(
            "================================"
        );


        if (
            !result ||
            typeof result !== "object"
        ) {

            throw new Error(
                "Empty backtest response"
            );

        }


        state.backtest =
            result;


        renderBacktest(
            result
        );


        console.log(
            "V10.1 BACKTEST DISPLAY UPDATED"
        );

    }

    catch (error) {

        console.error(
            "V10.1 BACKTEST ERROR:",
            error
        );


        setText(
            "btStatus",
            `ERROR: ${error.message}`
        );


        setText(
            "btEngine",
            "V10.1 Historical Simulation — ERROR"
        );

    }

    finally {

        state.backtestRunning =
            false;


        if (button) {

            button.disabled =
                false;

            button.textContent =
                "RUN V10.1 BACKTEST";

        }

    }

}


// ======================================================
// RESET BACKTEST
// ======================================================

function resetBacktestDisplay() {

    const fields = [

        "btCandles",
        "btTrades",
        "btBuyTrades",
        "btSellTrades",
        "btWins",
        "btLosses",
        "btWinRate",
        "btPoints",
        "btAvgWin",
        "btAvgLoss",
        "btProfitFactor",
        "btDrawdown"

    ];


    fields.forEach(
        id =>
            setText(
                id,
                "--"
            )
    );

}


// ======================================================
// RENDER BACKTEST
// ======================================================

function renderBacktest(
    result
) {

    console.log(
        "================================"
    );

    console.log(
        "RENDERING V10.1 BACKTEST"
    );

    console.log(
        result
    );

    console.log(
        "================================"
    );


    /*
    These IDs EXACTLY match
    the current index.html.
    */


    // Candles

    setText(
        "btCandles",
        result.candlesTested ?? "--"
    );


    // Trades

    setText(
        "btTrades",
        result.totalTrades ?? "--"
    );


    // BUY

    setText(
        "btBuyTrades",
        result.buyTrades ?? "--"
    );


    // SELL

    setText(
        "btSellTrades",
        result.sellTrades ?? "--"
    );


    // Wins

    setText(
        "btWins",
        result.winningTrades ?? "--"
    );


    // Losses

    setText(
        "btLosses",
        result.losingTrades ?? "--"
    );


    // Win Rate

    const winRate =
        Number(
            result.winRate
        );


    setText(
        "btWinRate",

        Number.isFinite(winRate)
            ? `${winRate.toFixed(2)}%`
            : "--"

    );


    // Total Points

    setText(
        "btPoints",
        formatNumber(
            result.totalPoints
        )
    );


    // Average Win

    setText(
        "btAvgWin",
        formatNumber(
            result.averageWin
        )
    );


    // Average Loss

    setText(
        "btAvgLoss",
        formatNumber(
            result.averageLoss
        )
    );


    // Profit Factor

    const profitFactor =
        Number(
            result.profitFactor
        );


    if (
        result.profitFactor === Infinity ||
        result.profitFactor === "Infinity"
    ) {

        setText(
            "btProfitFactor",
            "∞"
        );

    }

    else if (
        Number.isFinite(
            profitFactor
        )
    ) {

        setText(
            "btProfitFactor",
            profitFactor.toFixed(2)
        );

    }

    else {

        setText(
            "btProfitFactor",
            "--"
        );

    }


    // Drawdown

    setText(
        "btDrawdown",
        formatNumber(
            result.maxDrawdown
        )
    );


    // Status

    if (
        result.status ===
        "INSUFFICIENT_DATA"
    ) {

        setText(
            "btStatus",
            `Insufficient historical data — ${result.candlesTested ?? 0} candles`
        );

    }

    else {

        setText(
            "btStatus",
            `V10.1 BACKTEST COMPLETE — ${result.totalTrades ?? 0} trades simulated`
        );

    }


    // Engine

    setText(
        "btEngine",
        `${result.version || "V10.1"} Historical Simulation`
    );


    /*
    Log exactly what is now
    displayed.
    */

    console.log(
        "V10.1 DISPLAY VALUES:",
        {

            candles:
                result.candlesTested,

            trades:
                result.totalTrades,

            buy:
                result.buyTrades,

            sell:
                result.sellTrades,

            wins:
                result.winningTrades,

            losses:
                result.losingTrades,

            winRate:
                result.winRate,

            points:
                result.totalPoints,

            averageWin:
                result.averageWin,

            averageLoss:
                result.averageLoss,

            profitFactor:
                result.profitFactor,

            drawdown:
                result.maxDrawdown

        }
    );

}


// ======================================================
// PAPER TRADE BUTTON
// ======================================================

function setupPaperTradeButton() {

    const button =
        $("paperTradeBtn");


    if (!button) {

        return;

    }


    button.onclick =
        () => {

            const signal =
                $("signal")?.textContent;


            if (
                !signal ||
                signal === "WAIT"
            ) {

                alert(
                    "No valid paper trade signal yet."
                );

                return;

            }


            alert(

                `PAPER TRADE ONLY\n\n` +

                `Signal: ${signal}\n` +

                `Confidence: ${$("confidence")?.textContent || "--"}\n` +

                `Entry: ${$("entry")?.textContent || "--"}\n` +

                `Stop Loss: ${$("stoploss")?.textContent || "--"}\n` +

                `Target: ${$("target")?.textContent || "--"}\n\n` +

                `No real order has been placed.`

            );

        };

}


// ======================================================
// BACKTEST BUTTON
// ======================================================

function setupBacktestButton() {

    const button =
        $("runBacktestBtn");


    if (!button) {

        console.error(
            "V10.1 BACKTEST BUTTON NOT FOUND"
        );

        return;

    }


    button.onclick =
        runV10Backtest;


    console.log(
        "V10.1 backtest button connected:",
        button.id
    );

}


// ======================================================
// STATUS DOT
// ======================================================

function updateStatusDot(
    connected
) {

    const dot =
        $("statusDot");


    if (!dot) {

        return;

    }


    dot.classList.toggle(
        "closed",
        !connected
    );

}


// ======================================================
// CLOCK
// ======================================================

function updateTime() {

    const now =
        new Date();


    const text =
        now.toLocaleTimeString(
            "en-IN",
            {
                hour:
                    "2-digit",

                minute:
                    "2-digit",

                second:
                    "2-digit"
            }
        );


    setText(
        "lastUpdate",
        text
    );


    state.lastUpdate =
        now;

}


// ======================================================
// INITIALIZE
// ======================================================

async function initialize() {

    console.log(
        "================================"
    );

    console.log(
        "TradeMind Pro V10.1"
    );

    console.log(
        "Frontend loaded"
    );

    console.log(
        "Paper Trading Only"
    );

    console.log(
        "================================"
    );


    setText(
        "marketStatus",
        "CONNECTING"
    );


    setText(
        "analysisStatus",
        "CONNECTING"
    );


    setText(
        "btStatus",
        "Waiting for historical data"
    );


    setText(
        "btEngine",
        "V10.1 Historical Simulation"
    );


    setupPaperTradeButton();

    setupBacktestButton();


    await fetchIndicatorData();

    await fetchMarketData();

    updateTime();

}


// ======================================================
// REFRESH
// ======================================================

setInterval(
    fetchMarketData,
    5000
);


setInterval(
    fetchIndicatorData,
    30000
);


setInterval(
    updateTime,
    1000
);


// ======================================================
// START
// ======================================================

if (
    document.readyState ===
    "loading"
) {

    document.addEventListener(
        "DOMContentLoaded",
        initialize
    );

}

else {

    initialize();

}

/*
TradeMind Pro
V10 Frontend Controller

INDstocks → Vercel
             ↓
       Live Market Data
             ↓
       Technical Indicators
             ↓
       V10 Historical Backtest

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

    const elements =
        document.querySelectorAll(
            `[id="${id}"]`
        );

    if (!elements.length) {

        return;

    }

    elements.forEach(
        element => {

            element.textContent =
                value;

        }
    );

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


    /*
    AbortController prevents the UI
    from being stuck forever.
    */

    const controller =
        new AbortController();


    const timeout =
        setTimeout(
            () => {

                controller.abort();

            },
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
            "TradeMind API HTTP status:",
            response.status
        );


        console.log(
            "TradeMind API raw text:",
            text.slice(0, 3000)
        );


        let data;


        try {

            data =
                JSON.parse(text);

        }

        catch (parseError) {

            throw new Error(
                `Invalid JSON response from ${url} (HTTP ${response.status})`
            );

        }


        console.log(
            "TradeMind API parsed response:",
            data
        );


        if (!response.ok) {

            let message;


            if (
                typeof data?.error === "string"
            ) {

                message =
                    data.error;

            }

            else {

                message =
                    JSON.stringify(
                        data?.error ||
                        data
                    );

            }


            throw new Error(
                message ||
                `API HTTP error ${response.status}`
            );

        }


        if (
            data &&
            data.success === false
        ) {

            const message =
                typeof data.error === "string"

                    ? data.error

                    : JSON.stringify(
                        data.error ||
                        data
                    );


            throw new Error(
                message ||
                "API returned success:false"
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
                `API request timed out after ${timeoutMs / 1000} seconds`
            );

        }


        throw error;

    }

    finally {

        clearTimeout(
            timeout
        );

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


    return Object.values(
        data
    ).filter(

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
        String(
            instrument
        ).toLowerCase();


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
                        text.includes(
                            "nifty"
                        ) &&

                        !text.includes(
                            "banknifty"
                        )

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
                "/api/quotes",
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
            "NIFTY live price:",
            niftyPrice
        );


        console.log(
            "BANKNIFTY live price:",
            bankPrice
        );


        if (
            Number.isFinite(
                niftyPrice
            )
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
            Number.isFinite(
                bankPrice
            )
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


        updateStatusDot(
            true
        );


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


        updateStatusDot(
            false
        );

    }

}


// ======================================================
// MARKET RENDER
// ======================================================

function renderMarket() {

    if (
        state.nifty
    ) {

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


    if (
        state.banknifty
    ) {

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
                "/api/indicators?interval=5minute",
                15000
            );


        state.indicators =
            result;


        console.log(
            "V10 indicators:",
            result
        );


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
        Number(
            nifty.ema9
        );


    const ema21 =
        Number(
            nifty.ema21
        );


    const rsi =
        Number(
            nifty.rsi14
        );


    const vwap =
        Number(
            nifty.vwap
        );


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


        setText(
            "trend",
            trend
        );


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
        Number(
            bank.ema9
        );


    const ema21 =
        Number(
            bank.ema21
        );


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


    const trend =
        ema9 > ema21
            ? "BULLISH"
            : ema9 < ema21
                ? "BEARISH"
                : "SIDEWAYS";


    setText(
        "bankTrend",
        trend
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
        nifty.lastCandle ||
        {};

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


    // EMA

    if (
        ema9 > ema21
    ) {

        buyScore++;

        reasons.push(
            "EMA bullish"
        );

    }

    else if (
        ema9 < ema21
    ) {

        sellScore++;

        reasons.push(
            "EMA bearish"
        );

    }


    // RSI

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


    // VWAP

    if (
        price > vwap
    ) {

        buyScore++;

        reasons.push(
            "Price above VWAP"
        );

    }

    else if (
        price < vwap
    ) {

        sellScore++;

        reasons.push(
            "Price below VWAP"
        );

    }


    // CANDLE

    let candleStrong =
        false;


    if (
        Number.isFinite(open) &&
        Number.isFinite(high) &&
        Number.isFinite(low) &&
        Number.isFinite(close)
    ) {

        if (
            close > open
        ) {

            buyScore++;

            reasons.push(
                "Bullish candle"
            );

        }

        else if (
            close < open
        ) {

            sellScore++;

            reasons.push(
                "Bearish candle"
            );

        }


        const range =
            high -
            low;


        const body =
            Math.abs(
                close -
                open
            );


        candleStrong =
            range > 0 &&
            (
                body /
                range
            ) >= 0.50;

    }


    let signal =
        "WAIT";


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
        confidenceMap[
            maximum
        ] ?? 0;


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


    if (
        signal === "WAIT"
    ) {

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


    if (
        confidenceFill
    ) {

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


    let risk;


    if (
        Number.isFinite(atr) &&
        atr > 0
    ) {

        risk =
            atr *
            1.5;

    }

    else {

        risk =
            price *
            0.001;

    }


    const reward =
        risk *
        2;


    const bullish =
        signal === "BUY BIAS" ||
        signal === "STRONG BUY";


    const stop =
        bullish
            ? price - risk
            : price + risk;


    const target =
        bullish
            ? price + reward
            : price - reward;


    setText(
        "entry",
        formatPrice(price)
    );


    setText(
        "stoploss",
        formatPrice(stop)
    );


    setText(
        "target",
        formatPrice(target)
    );


    setText(
        "riskReward",
        "1 : 2.00"
    );

}


// ======================================================
// V10 DIAGNOSTICS
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
        formatPrice(
            nifty.ema9
        )
    );


    setText(
        "diagEma21",
        formatPrice(
            nifty.ema21
        )
    );


    setText(
        "diagRsi",
        formatNumber(
            nifty.rsi14
        )
    );


    setText(
        "diagVwap",
        formatPrice(
            nifty.vwap
        )
    );


    setText(
        "diagAtr",
        formatNumber(
            nifty.atr14
        )
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
// V10 BACKTEST
// ======================================================

async function runV10Backtest() {

    /*
    Prevent duplicate requests.
    */

    if (
        state.backtestRunning
    ) {

        console.log(
            "V10 backtest already running."
        );

        return;

    }


    state.backtestRunning =
        true;


    /*
    Support every possible button ID
    that exists in your current HTML.
    */

    const button =
        $("runBacktestBtn") ||
        $("runV10Backtest") ||
        $("runV9Backtest");


    if (
        button
    ) {

        button.disabled =
            true;

        button.textContent =
            "RUNNING V10 BACKTEST...";

    }


    resetBacktestDisplay();


    setText(
        "backtestStatus",
        "Running V10 historical simulation..."
    );


    console.log(
        "================================"
    );

    console.log(
        "TradeMind V10 BACKTEST START"
    );

    console.log(
        "================================"
    );


    try {

        /*
        IMPORTANT:

        This is the exact API endpoint
        that we have already verified
        is returning valid V10 results.
        */

        const apiUrl =
            "/api/backtest?interval=5minute";


        console.log(
            "Calling:",
            apiUrl
        );


        const result =
            await apiFetch(
                apiUrl,
                15000
            );


        console.log(
            "================================"
        );

        console.log(
            "V10 BACKTEST RESULT RECEIVED"
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
                "Backtest API returned an empty response"
            );

        }


        state.backtest =
            result;


        /*
        Render immediately.
        */

        renderBacktest(
            result
        );


        /*
        Explicit completion message.
        */

        console.log(
            "V10 backtest rendering complete."
        );

    }

    catch (error) {

        console.error(
            "================================"
        );

        console.error(
            "V10 BACKTEST ERROR"
        );

        console.error(
            error
        );

        console.error(
            "================================"
        );


        const message =
            error?.message ||
            "Unknown backtest error";


        setText(
            "backtestStatus",
            `Backtest Error: ${message}`
        );


        /*
        Show a visible error in the
        console as well.
        */

        setText(
            "backtestEngine",
            "V10 Historical Simulation — ERROR"
        );

    }

    finally {

        /*
        THIS IS CRITICAL.

        The button is ALWAYS restored,
        whether API succeeds or fails.
        */

        state.backtestRunning =
            false;


        if (
            button
        ) {

            button.disabled =
                false;

            button.textContent =
                "RUN V10 BACKTEST";

        }


        console.log(
            "V10 backtest request finished."
        );

    }

}


// ======================================================
// RESET BACKTEST DISPLAY
// ======================================================

function resetBacktestDisplay() {

    const fields = [

        "candlesTested",

        "totalTrades",

        "buyTrades",

        "sellTrades",

        "winningTrades",

        "losingTrades",

        "winRate",

        "totalPoints",

        "averageWin",

        "averageLoss",

        "profitFactor",

        "maxDrawdown"

    ];


    for (
        const id of fields
    ) {

        setText(
            id,
            "--"
        );

    }


    /*
    Clear old trade history.
    */

    const container =
        $("tradeHistory") ||
        $("tradeHistoryTable") ||
        $("tradeList");


    if (
        container &&
        container.tagName !== "TABLE"
    ) {

        container.innerHTML = "";

    }

}


// ======================================================
// SAFE STATISTIC
// ======================================================

function safeStatistic(
    value
) {

    if (
        value === null ||
        value === undefined
    ) {

        return null;

    }


    if (
        typeof value === "number" ||
        typeof value === "string"
    ) {

        return value;

    }


    return null;

}


// ======================================================
// RENDER BACKTEST
// ======================================================

function renderBacktest(
    result
) {

    if (
        !result
    ) {

        return;

    }


    console.log(
        "Rendering V10 backtest:",
        result
    );


    // ==================================================
    // VERSION
    // ==================================================

    const version =
        result.version ||
        "V10";


    setText(
        "backtestEngine",
        `${version} Historical Simulation`
    );


    // ==================================================
    // CANDLES
    // ==================================================

    const candles =
        safeStatistic(
            result.candlesTested
        );


    setText(
        "candlesTested",
        candles ??
        "--"
    );


    // ==================================================
    // TRADE COUNTS
    // ==================================================

    const totalTrades =
        safeStatistic(
            result.totalTrades
        );


    const buyTrades =
        safeStatistic(
            result.buyTrades
        );


    const sellTrades =
        safeStatistic(
            result.sellTrades
        );


    setText(
        "totalTrades",
        totalTrades ??
        "--"
    );


    setText(
        "buyTrades",
        buyTrades ??
        "--"
    );


    setText(
        "sellTrades",
        sellTrades ??
        "--"
    );


    // ==================================================
    // WINS / LOSSES
    // ==================================================

    const winningTrades =
        safeStatistic(
            result.winningTrades
        );


    const losingTrades =
        safeStatistic(
            result.losingTrades
        );


    setText(
        "winningTrades",
        winningTrades ??
        "--"
    );


    setText(
        "losingTrades",
        losingTrades ??
        "--"
    );


    // ==================================================
    // WIN RATE
    // ==================================================

    const winRate =
        Number(
            result.winRate
        );


    setText(
        "winRate",

        Number.isFinite(winRate)

            ? `${winRate.toFixed(2)}%`

            : "--"

    );


    // ==================================================
    // TOTAL POINTS
    // ==================================================

    setText(
        "totalPoints",
        formatNumber(
            result.totalPoints
        )
    );


    // ==================================================
    // AVERAGE WIN
    // ==================================================

    setText(
        "averageWin",
        formatNumber(
            result.averageWin
        )
    );


    // ==================================================
    // AVERAGE LOSS
    // ==================================================

    setText(
        "averageLoss",
        formatNumber(
            result.averageLoss
        )
    );


    // ==================================================
    // PROFIT FACTOR
    // ==================================================

    const pf =
        Number(
            result.profitFactor
        );


    if (
        result.profitFactor === Infinity ||
        result.profitFactor === "Infinity"
    ) {

        setText(
            "profitFactor",
            "∞"
        );

    }

    else if (
        Number.isFinite(pf)
    ) {

        setText(
            "profitFactor",
            pf.toFixed(2)
        );

    }

    else {

        setText(
            "profitFactor",
            "--"
        );

    }


    // ==================================================
    // MAX DRAWDOWN
    // ==================================================

    setText(
        "maxDrawdown",
        formatNumber(
            result.maxDrawdown
        )
    );


    // ==================================================
    // STATUS
    // ==================================================

    if (
        result.status ===
        "INSUFFICIENT_DATA"
    ) {

        setText(

            "backtestStatus",

            `Insufficient historical data — ${candles ?? 0} candles`

        );

    }

    else if (
        result.status ===
        "COMPLETED"
    ) {

        setText(

            "backtestStatus",

            `V10 BACKTEST COMPLETE — ${totalTrades ?? 0} trades simulated`

        );

    }

    else {

        setText(

            "backtestStatus",

            `V10 BACKTEST RESULT — ${totalTrades ?? 0} trades`

        );

    }


    // ==================================================
    // ENGINE
    // ==================================================

    setText(
        "backtestEngine",
        "V10 Historical Simulation"
    );


    // ==================================================
    // TRADES
    // ==================================================

    if (
        Array.isArray(
            result.trades
        )
    ) {

        if (!state.backtest) {

            state.backtest = {};

        }


        state.backtest.trades =
            result.trades;


        console.log(
            `V10 trade history: ${result.trades.length} trades`
        );


        console.table(
            result.trades
        );


        renderTradeHistory(
            result.trades
        );

    }

    else {

        console.log(
            "No trade array returned."
        );

    }


    /*
    Final diagnostic.
    */

    console.log(
        "V10 DISPLAY VALUES:",
        {

            candles:
                result.candlesTested,

            trades:
                result.totalTrades,

            buys:
                result.buyTrades,

            sells:
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

            maxDrawdown:
                result.maxDrawdown

        }
    );

}


// ======================================================
// TRADE HISTORY
// ======================================================

function renderTradeHistory(
    trades
) {

    if (
        !Array.isArray(trades)
    ) {

        return;

    }


    const container =
        $("tradeHistory") ||
        $("tradeHistoryTable") ||
        $("tradeList");


    if (
        !container
    ) {

        console.log(
            "Trade history container not found."
        );

        return;

    }


    // ==================================================
    // TABLE
    // ==================================================

    if (
        container.tagName === "TABLE"
    ) {

        let tbody =
            container.querySelector(
                "tbody"
            );


        if (!tbody) {

            tbody =
                document.createElement(
                    "tbody"
                );

            container.appendChild(
                tbody
            );

        }


        tbody.innerHTML = "";


        trades.forEach(
            (trade, index) => {

                const row =
                    document.createElement(
                        "tr"
                    );


                row.innerHTML = `

                    <td>${index + 1}</td>

                    <td>${trade.side ?? "--"}</td>

                    <td>${formatPrice(trade.entry)}</td>

                    <td>${formatPrice(trade.stop)}</td>

                    <td>${formatPrice(trade.target)}</td>

                    <td>${formatPrice(trade.exit)}</td>

                    <td>${formatNumber(trade.points)}</td>

                    <td>${trade.result ?? "--"}</td>

                    <td>${trade.reason ?? "--"}</td>

                `;


                tbody.appendChild(
                    row
                );

            }
        );


        return;

    }


    // ==================================================
    // DIV / CONTAINER
    // ==================================================

    container.innerHTML = "";


    trades.forEach(
        (trade, index) => {

            const row =
                document.createElement(
                    "div"
                );


            row.className =
                "trade-history-row";


            row.textContent =

                `#${index + 1} ` +

                `${trade.side ?? "--"} | ` +

                `Entry ${formatPrice(trade.entry)} | ` +

                `Exit ${formatPrice(trade.exit)} | ` +

                `${formatNumber(trade.points)} pts | ` +

                `${trade.result ?? "--"} | ` +

                `${trade.reason ?? "--"}`;


            container.appendChild(
                row
            );

        }
    );

}


// ======================================================
// BACKTEST BUTTON
// ======================================================

function setupBacktestButton() {

    /*
    Find the button regardless of which
    ID your current HTML uses.
    */

    const button =
        $("runBacktestBtn") ||
        $("runV10Backtest") ||
        $("runV9Backtest");


    if (
        !button
    ) {

        console.warn(
            "V10 backtest button NOT FOUND."
        );

        return;

    }


    /*
    Remove old inline/listener behavior
    by replacing onclick directly.
    */

    button.onclick =
        runV10Backtest;


    console.log(
        "V10 backtest button connected:",
        button.id
    );

}


// ======================================================
// PAPER TRADE BUTTON
// ======================================================

function setupPaperTradeButton() {

    const button =
        $("paperTradeBtn");


    if (
        !button
    ) {

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


            const entry =
                $("entry")?.textContent ||
                "--";


            const stop =
                $("stoploss")?.textContent ||
                "--";


            const target =
                $("target")?.textContent ||
                "--";


            const confidence =
                $("confidence")?.textContent ||
                "--";


            alert(

                `PAPER TRADE ONLY\n\n` +

                `Signal: ${signal}\n` +

                `Confidence: ${confidence}\n` +

                `Entry: ${entry}\n` +

                `Stop Loss: ${stop}\n` +

                `Target: ${target}\n\n` +

                `No real order has been placed.`

            );

        };

}


// ======================================================
// STATUS DOT
// ======================================================

function updateStatusDot(
    connected
) {

    const dot =
        $("statusDot");


    if (
        !dot
    ) {

        return;

    }


    if (
        connected
    ) {

        dot.classList.remove(
            "closed"
        );

    }

    else {

        dot.classList.add(
            "closed"
        );

    }

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
        "TradeMind Pro V10 started"
    );

    console.log(
        "Frontend controller loaded"
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
        "backtestStatus",
        "Waiting for historical data"
    );


    setText(
        "backtestEngine",
        "V10 Historical Simulation"
    );


    setupPaperTradeButton();

    setupBacktestButton();


    /*
    Load indicators first.
    */

    await fetchIndicatorData();


    /*
    Then live market data.
    */

    await fetchMarketData();


    updateTime();

}


// ======================================================
// REFRESH TIMERS
// ======================================================

/*
Live prices:
every 5 seconds.
*/

setInterval(
    fetchMarketData,
    5000
);


/*
Indicators:
every 30 seconds.
*/

setInterval(
    fetchIndicatorData,
    30000
);


/*
Clock:
every second.
*/

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

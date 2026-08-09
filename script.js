/*
TradeMind Pro
Frontend Controller
INDstocks → Vercel → Dashboard

Paper trading only.
No real orders.
*/

"use strict";


// ========================================
// GLOBAL STATE
// ========================================

const state = {

    nifty: null,

    banknifty: null,

    indicators: null,

    connected: false,

    lastUpdate: null

};


// ========================================
// DOM HELPER
// ========================================

function $(id) {

    return document.getElementById(id);

}


function setText(id, value) {

    const el = $(id);

    if (el) {

        el.textContent = value;

    }

}


// ========================================
// NUMBER FORMAT
// ========================================

function formatPrice(value) {

    const number = Number(value);

    if (!Number.isFinite(number)) {

        return "--";

    }

    return number.toLocaleString("en-IN", {

        minimumFractionDigits: 2,

        maximumFractionDigits: 2

    });

}


function formatIndicator(value) {

    const number = Number(value);

    if (!Number.isFinite(number)) {

        return "--";

    }

    return number.toFixed(2);

}


// ========================================
// PRICE EXTRACTION
// ========================================

function extractPrice(quote) {

    if (typeof quote === "number") {

        return quote;

    }

    if (!quote || typeof quote !== "object") {

        return null;

    }

    const possibleFields = [

        "ltp",

        "last_price",

        "lastPrice",

        "price",

        "close",

        "lp",

        "last_traded_price",

        "lastTradedPrice"

    ];


    for (const field of possibleFields) {

        const value = Number(quote[field]);

        if (
            Number.isFinite(value) &&
            value > 0
        ) {

            return value;

        }

    }

    return null;

}


// ========================================
// QUOTE EXTRACTION
// ========================================

function extractQuotes(data) {

    if (Array.isArray(data)) {

        return data;

    }

    if (!data || typeof data !== "object") {

        return [];

    }

    if (Array.isArray(data.data)) {

        return data.data;

    }

    if (Array.isArray(data.quotes)) {

        return data.quotes;

    }

    if (Array.isArray(data.results)) {

        return data.results;

    }

    if (Array.isArray(data.items)) {

        return data.items;

    }

    return Object.values(data).filter(

        value =>

            value &&

            typeof value === "object" &&

            !Array.isArray(value)

    );

}


// ========================================
// FIND INSTRUMENT
// ========================================

function findInstrument(quotes, instrument) {

    const wanted =
        instrument.toLowerCase();


    return quotes.find(quote => {

        if (
            !quote ||
            typeof quote !== "object"
        ) {

            return false;

        }

        const text =
            JSON.stringify(quote)
                .toLowerCase();


        if (wanted === "nifty") {

            return (

                text.includes("40000001") ||

                (
                    text.includes("nifty") &&
                    !text.includes("banknifty")
                )

            );

        }


        if (wanted === "banknifty") {

            return (

                text.includes("40000003") ||

                text.includes("banknifty")

            );

        }


        return false;

    }) || null;

}


// ========================================
// API REQUEST HELPER
// ========================================

async function apiFetch(url) {

    console.log(
        "TradeMind API request:",
        url
    );


    const response =
        await fetch(

            url,

            {

                method: "GET",

                cache: "no-store",

                headers: {

                    "Accept":
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

    }

    catch {

        throw new Error(

            `Invalid API response (${response.status})`

        );

    }


    console.log(

        "TradeMind API response:",

        url,

        data

    );


    if (!response.ok) {

        const message =

            typeof data.error === "string"

                ? data.error

                : JSON.stringify(
                    data.error || data
                );


        throw new Error(

            message ||
            `API error ${response.status}`

        );

    }


    if (data.success === false) {

        throw new Error(

            typeof data.error === "string"

                ? data.error

                : JSON.stringify(
                    data.error
                )

        );

    }


    return data;

}


// ========================================
// MARKET DATA
// ========================================

async function fetchMarketData() {

    try {

        setText(
            "marketStatus",
            "CONNECTING"
        );


        setText(
            "analysisStatus",
            "CONNECTING"
        );


        const result =
            await apiFetch(
                "/api/quotes"
            );


        const quotes =
            extractQuotes(
                result.data ?? result
            );


        console.log(
            "TradeMind extracted quotes:",
            quotes
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


        // --------------------------------
        // NIFTY
        // --------------------------------

        if (niftyPrice !== null) {

            state.nifty = {

                price: niftyPrice,

                previous:
                    state.nifty?.price ??
                    niftyPrice

            };

        }


        // --------------------------------
        // BANK NIFTY
        // --------------------------------

        if (bankPrice !== null) {

            state.banknifty = {

                price: bankPrice,

                previous:
                    state.banknifty?.price ??
                    bankPrice

            };

        }


        renderMarket();


        state.connected = true;


        setText(
            "marketStatus",
            "LIVE"
        );


        setText(
            "analysisStatus",
            "LIVE"
        );


        setText(
            "dataStatus",
            "INDSTOCKS"
        );


        updateStatusDot(true);


        updateTime();

    }


    catch (error) {

        console.error(

            "TradeMind market data error:",

            error

        );


        state.connected = false;


        setText(
            "marketStatus",
            "OFFLINE"
        );


        setText(
            "analysisStatus",
            "API ERROR"
        );


        setText(
            "dataStatus",
            "API ERROR"
        );


        updateStatusDot(false);


        setText(
            "lastUpdate",
            error.message
        );

    }

}


// ========================================
// RENDER MARKET
// ========================================

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


// ========================================
// PRICE CHANGE
// ========================================

function renderChange(
    elementId,
    current,
    previous
) {

    const el =
        $(elementId);


    if (!el) {

        return;

    }


    const difference =
        current - previous;


    if (
        !Number.isFinite(difference) ||
        difference === 0
    ) {

        el.textContent =
            "No change";


        el.className =
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


    el.textContent =

        `${direction} ${Math.abs(difference).toFixed(2)} (${Math.abs(percent).toFixed(2)}%)`;


    el.className =

        difference > 0

            ? "change up"

            : "change down";

}


// ========================================
// INDICATORS
// ========================================

async function fetchIndicatorData() {

    try {

        setText(
            "analysisStatus",
            "CALCULATING"
        );


        const result =

            await apiFetch(

                "/api/indicators?interval=5minute"

            );


        state.indicators =
            result;


        console.log(

            "TradeMind indicators:",

            result

        );


        renderIndicators();


        analyzeMarket();


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


        setText(

            "lastUpdate",

            error.message

        );

    }

}


// ========================================
// RENDER INDICATORS
// ========================================

function renderIndicators() {

    const data =
        state.indicators;


    if (!data) {

        return;

    }


    const nifty =
        data.nifty || {};


    const bank =
        data.banknifty || {};


    console.log(
        "NIFTY indicators:",
        nifty
    );


    console.log(
        "BANKNIFTY indicators:",
        bank
    );


    // ------------------------------------
    // PRIMARY ANALYSIS = NIFTY
    // ------------------------------------

    const ema9 =
        Number(nifty.ema9);


    const ema21 =
        Number(nifty.ema21);


    const rsi =
        Number(nifty.rsi14);


    const vwap =
        Number(nifty.vwap);


    // ------------------------------------
    // TREND
    // ------------------------------------

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


    // ------------------------------------
    // MOMENTUM
    // ------------------------------------

    if (Number.isFinite(rsi)) {

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


    // ------------------------------------
    // VWAP POSITION
    // ------------------------------------

    if (Number.isFinite(vwap)) {

        const price =
            state.nifty?.price;


        if (Number.isFinite(price)) {

            const vwapPosition =

                price > vwap

                    ? "ABOVE VWAP"

                    : price < vwap

                        ? "BELOW VWAP"

                        : "AT VWAP";


            setText(

                "volatility",

                vwapPosition

            );

        }

    }


    // ------------------------------------
    // CANDLE COUNT
    // ------------------------------------

    const candleCount =
        nifty.candleCount;


    if (

        Number.isFinite(
            Number(candleCount)
        )

    ) {

        setText(

            "candleStatus",

            `${candleCount} CANDLES`

        );

    }

}


// ========================================
// UNIFIED STRATEGY ENGINE
// ========================================

function calculateStrategy() {

    const nifty =
        state.indicators?.nifty;


    if (!nifty) {

        return {

            signal: "WAIT",

            reason:
                "Indicators unavailable"

        };

    }


    // ------------------------------------
    // REAL INDICATOR VALUES
    // ------------------------------------

    const ema9 =
        Number(nifty.ema9);


    const ema21 =
        Number(nifty.ema21);


    const rsi =
        Number(nifty.rsi14);


    const vwap =
        Number(nifty.vwap);


    const price =
        Number(
            state.nifty?.price
        );


    // ------------------------------------
    // VALIDATION
    // ------------------------------------

    if (

        !Number.isFinite(price) ||

        !Number.isFinite(ema9) ||

        !Number.isFinite(ema21) ||

        !Number.isFinite(rsi)

    ) {

        return {

            signal: "WAIT",

            reason:
                "Insufficient indicator data"

        };

    }


    // ------------------------------------
    // TREND
    // ------------------------------------

    const bullishTrend =
        ema9 > ema21;


    const bearishTrend =
        ema9 < ema21;


    // ------------------------------------
    // MOMENTUM
    // ------------------------------------

    const bullishMomentum =
        rsi >= 55;


    const bearishMomentum =
        rsi <= 45;


    // ------------------------------------
    // VWAP CONFIRMATION
    // ------------------------------------

    const aboveVWAP =

        !Number.isFinite(vwap) ||

        price > vwap;


    const belowVWAP =

        !Number.isFinite(vwap) ||

        price < vwap;


    // ------------------------------------
    // BUY SIGNAL
    // ------------------------------------

    if (

        bullishTrend &&

        bullishMomentum &&

        aboveVWAP

    ) {

        return {

            signal: "BUY",

            reason:
                "Bullish trend + positive RSI + above VWAP",

            price,

            ema9,

            ema21,

            rsi,

            vwap

        };

    }


    // ------------------------------------
    // SELL SIGNAL
    // ------------------------------------

    if (

        bearishTrend &&

        bearishMomentum &&

        belowVWAP

    ) {

        return {

            signal: "SELL",

            reason:
                "Bearish trend + negative RSI + below VWAP",

            price,

            ema9,

            ema21,

            rsi,

            vwap

        };

    }


    // ------------------------------------
    // WAIT
    // ------------------------------------

    return {

        signal: "WAIT",

        reason:
            "Conditions not fully confirmed",

        price,

        ema9,

        ema21,

        rsi,

        vwap

    };

}


// ========================================
// MARKET ANALYSIS
// ========================================

function analyzeMarket() {

    const strategy =
        calculateStrategy();


    console.log(
        "================================"
    );


    console.log(
        "TradeMind Strategy Result:",
        strategy
    );


    console.log(
        "================================"
    );


    // ------------------------------------
    // SIGNAL
    // ------------------------------------

    setText(

        "signal",

        strategy.signal

    );


    // ------------------------------------
    // SIGNAL REASON
    // ------------------------------------

    const reasonElement =
        $("signalReason");


    if (reasonElement) {

        reasonElement.textContent =
            strategy.reason;

    }


    // ------------------------------------
    // STRATEGY STATUS
    // ------------------------------------

    const strategyStatus =
        $("strategyStatus");


    if (strategyStatus) {

        strategyStatus.textContent =

            strategy.signal === "WAIT"

                ? "WAITING FOR CONFIRMATION"

                : "ACTIVE";

    }


    // ------------------------------------
    // TRADE SETUP
    // ------------------------------------

    updateTradeSetup(
        strategy
    );

}


// ========================================
// PAPER TRADE SETUP
// ========================================

function updateTradeSetup(strategy) {

    const price =
        Number(strategy.price);


    const signal =
        strategy.signal;


    // ------------------------------------
    // NO TRADE
    // ------------------------------------

    if (

        !Number.isFinite(price) ||

        signal === "WAIT"

    ) {

        setText(
            "entry",
            "--"
        );


        setText(
            "stoploss",
            "--"
        );


        setText(
            "target",
            "--"
        );


        setText(
            "riskReward",
            "--"
        );


        return;

    }


    // ------------------------------------
    // TEMPORARY RISK MODEL
    //
    // Stop = 0.10%
    // Target = 0.20%
    //
    // This is intentionally simple for
    // the first paper-testing stage.
    //
    // Later we will replace this with
    // ATR/market-structure based risk.
    // ------------------------------------

    const risk =
        price * 0.001;


    const reward =
        risk * 2;


    let stop;
    let target;


    // ------------------------------------
    // BUY
    // ------------------------------------

    if (signal === "BUY") {

        stop =
            price - risk;


        target =
            price + reward;

    }


    // ------------------------------------
    // SELL
    // ------------------------------------

    else if (signal === "SELL") {

        stop =
            price + risk;


        target =
            price - reward;

    }


    // ------------------------------------
    // RENDER TRADE SETUP
    // ------------------------------------

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

        "1 : 2"

    );

}


// ========================================
// STATUS DOT
// ========================================

function updateStatusDot(connected) {

    const dot =
        $("statusDot");


    if (!dot) {

        return;

    }


    if (connected) {

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


// ========================================
// TIME
// ========================================

function updateTime() {

    const now =
        new Date();


    const text =

        now.toLocaleTimeString(

            "en-IN",

            {

                hour: "2-digit",

                minute: "2-digit",

                second: "2-digit"

            }

        );


    setText(
        "lastUpdate",
        text
    );

}


// ========================================
// PAPER TRADE BUTTON
// ========================================

function setupPaperTradeButton() {

    const button =
        $("paperTradeBtn");


    if (!button) {

        return;

    }


    button.addEventListener(

        "click",

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
                $("entry")?.textContent || "--";


            const stoploss =
                $("stoploss")?.textContent || "--";


            const target =
                $("target")?.textContent || "--";


            const riskReward =
                $("riskReward")?.textContent || "--";


            alert(

                `PAPER TRADE ONLY\n\n` +

                `Signal: ${signal}\n\n` +

                `Entry: ${entry}\n` +

                `Stop Loss: ${stoploss}\n` +

                `Target: ${target}\n` +

                `Risk / Reward: ${riskReward}\n\n` +

                `No real order has been placed.`

            );

        }

    );

}


// ========================================
// INITIALIZE
// ========================================

async function initialize() {

    console.log(
        "================================"
    );


    console.log(
        "TradeMind Pro frontend started"
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


    setupPaperTradeButton();


    // ------------------------------------
    // INITIAL MARKET DATA
    // ------------------------------------

    await fetchMarketData();


    // ------------------------------------
    // INITIAL INDICATORS
    // ------------------------------------

    await fetchIndicatorData();


    updateTime();

}


// ========================================
// REFRESH MARKET DATA
// Every 5 seconds
// ========================================

setInterval(

    fetchMarketData,

    5000

);


// ========================================
// REFRESH INDICATORS
// Every 30 seconds
// ========================================

setInterval(

    fetchIndicatorData,

    30000

);


// ========================================
// START APPLICATION
// ========================================

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

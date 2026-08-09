/*
TradeMind Pro
V6 Frontend Controller

INDstocks → Vercel → Dashboard

Features:
- Live NIFTY 50
- Live BANKNIFTY
- EMA 9
- EMA 21
- RSI 14
- VWAP
- ATR 14
- Swing High / Swing Low
- Strategy score
- Confidence
- Dynamic Entry / SL / Target
- Paper trading only

NO REAL ORDERS.
*/


"use strict";


// ======================================================
// GLOBAL STATE
// ======================================================

const state = {

    nifty: null,

    banknifty: null,

    indicators: null,

    connected: false,

    lastUpdate: null

};


// ======================================================
// DOM HELPER
// ======================================================

function $(id) {

    return document.getElementById(id);

}


function setText(id, value) {

    const element = $(id);

    if (element) {

        element.textContent = value;

    }

}


// ======================================================
// NUMBER FORMAT
// ======================================================

function formatPrice(value) {

    const number = Number(value);

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


function formatIndicator(value) {

    const number = Number(value);

    if (!Number.isFinite(number)) {

        return "--";

    }

    return number.toFixed(2);

}


// ======================================================
// PRICE EXTRACTION
// ======================================================

function extractPrice(quote) {

    if (typeof quote === "number") {

        return quote;

    }

    if (!quote || typeof quote !== "object") {

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


    for (const field of fields) {

        const value =
            Number(quote[field]);

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


// ======================================================
// FIND INSTRUMENT
// ======================================================

function findInstrument(
    quotes,
    instrument
) {

    const wanted =
        instrument.toLowerCase();


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


            if (wanted === "nifty") {

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


            if (wanted === "banknifty") {

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
// API REQUEST
// ======================================================

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


// ======================================================
// MARKET DATA
// ======================================================

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
                result.data ??
                result
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


        if (
            niftyPrice !== null
        ) {

            state.nifty = {

                price: niftyPrice,

                previous:
                    state.nifty?.price ??
                    niftyPrice

            };

        }


        if (
            bankPrice !== null
        ) {

            state.banknifty = {

                price: bankPrice,

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
            "analysisStatus",
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
            "TradeMind market data error:",
            error
        );


        state.connected =
            false;


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


        updateStatusDot(
            false
        );


        setText(
            "lastUpdate",
            error.message
        );

    }

}


// ======================================================
// RENDER MARKET
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


    const difference =
        current - previous;


    if (
        !Number.isFinite(
            difference
        ) ||
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
// INDICATOR DATA
// ======================================================

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


        renderV6Diagnostics();


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


// ======================================================
// RENDER INDICATORS
// ======================================================

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


    const ema9 =
        Number(nifty.ema9);


    const ema21 =
        Number(nifty.ema21);


    const rsi =
        Number(nifty.rsi14);


    const vwap =
        Number(nifty.vwap);


    // -------------------------
    // TREND
    // -------------------------

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


    // -------------------------
    // RSI
    // -------------------------

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


    // -------------------------
    // VWAP
    // -------------------------

    if (
        Number.isFinite(vwap)
    ) {

        const price =
            state.nifty?.price;


        if (
            Number.isFinite(price)
        ) {

            setText(
                "volatility",

                price > vwap
                    ? "ABOVE VWAP"
                    : "BELOW VWAP"

            );

        }

    }


    // -------------------------
    // CANDLE COUNT
    // -------------------------

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


    updateBankTrend();

}


// ======================================================
// MARKET ANALYSIS
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


    const price =
        state.nifty?.price;


    if (
        !Number.isFinite(ema9) ||
        !Number.isFinite(ema21) ||
        !Number.isFinite(rsi) ||
        !Number.isFinite(price)
    ) {

        setText(
            "signal",
            "WAIT"
        );


        return;

    }


    const aboveVWAP =
        Number.isFinite(vwap)
            ? price > vwap
            : null;


    const belowVWAP =
        Number.isFinite(vwap)
            ? price < vwap
            : null;


    // ==================================================
    // V6 SCORE
    // ==================================================

    let buyScore = 0;

    let sellScore = 0;


    // EMA
    if (ema9 > ema21) {

        buyScore++;

    }


    if (ema9 < ema21) {

        sellScore++;

    }


    // RSI
    if (rsi >= 55) {

        buyScore++;

    }


    if (rsi <= 45) {

        sellScore++;

    }


    // VWAP
    if (aboveVWAP === true) {

        buyScore++;

    }


    if (belowVWAP === true) {

        sellScore++;

    }


    // ==================================================
    // SIGNAL
    // ==================================================

    let signal =
        "WAIT";


    if (
        buyScore >= 3 &&
        buyScore > sellScore
    ) {

        signal =
            buyScore >= 4
                ? "STRONG BUY"
                : "BUY BIAS";

    }


    else if (
        sellScore >= 3 &&
        sellScore > buyScore
    ) {

        signal =
            sellScore >= 4
                ? "STRONG SELL"
                : "SELL BIAS";

    }


    setText(
        "signal",
        signal
    );


    updateTradeSetup(
        price,
        signal
    );


    // ==================================================
    // LIVE DIAGNOSTIC SCORES
    // ==================================================

    setText(
        "buyScore",
        buyScore
    );


    setText(
        "sellScore",
        sellScore
    );


    const total =
        buyScore +
        sellScore;


    let confidence = 0;


    if (total > 0) {

        confidence =
            Math.round(
                (
                    Math.max(
                        buyScore,
                        sellScore
                    ) /
                    4
                ) * 100
            );

        confidence =
            Math.min(
                confidence,
                100
            );

    }


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


    // ==================================================
    // REASON
    // ==================================================

    const reasons = [];


    if (ema9 > ema21) {

        reasons.push(
            "EMA 9 above EMA 21"
        );

    }


    if (ema9 < ema21) {

        reasons.push(
            "EMA 9 below EMA 21"
        );

    }


    if (rsi >= 55) {

        reasons.push(
            "RSI bullish"
        );

    }


    if (rsi <= 45) {

        reasons.push(
            "RSI bearish"
        );

    }


    if (aboveVWAP === true) {

        reasons.push(
            "Price above VWAP"
        );

    }


    if (belowVWAP === true) {

        reasons.push(
            "Price below VWAP"
        );

    }


    setText(
        "signalReason",
        reasons.length
            ? reasons.join(" + ")
            : "Waiting for confirmation"
    );


    setText(
        "strategyStatus",
        signal === "WAIT"
            ? "WAITING FOR CONFIRMATION"
            : "ACTIVE — PAPER ANALYSIS"
    );

}


// ======================================================
// V6 DIAGNOSTICS
// ======================================================

function renderV6Diagnostics() {

    const nifty =
        state.indicators?.nifty;


    if (!nifty) {

        return;

    }


    const price =
        state.nifty?.price;


    // ----------------------------------
    // EMA
    // ----------------------------------

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


    // ----------------------------------
    // RSI
    // ----------------------------------

    setText(
        "diagRsi",
        formatIndicator(
            nifty.rsi14
        )
    );


    // ----------------------------------
    // VWAP
    // ----------------------------------

    setText(
        "diagVwap",
        formatPrice(
            nifty.vwap
        )
    );


    // ----------------------------------
    // ATR
    // ----------------------------------

    const atr =
        nifty.atr14 ??
        nifty.atr ??
        nifty.ATR14;


    setText(
        "diagAtr",
        formatIndicator(
            atr
        )
    );


    // ----------------------------------
    // SWING HIGH
    // ----------------------------------

    const swingHigh =
        nifty.swingHigh ??
        nifty.swing_high ??
        nifty.high;


    setText(
        "diagSwingHigh",
        formatPrice(
            swingHigh
        )
    );


    // ----------------------------------
    // SWING LOW
    // ----------------------------------

    const swingLow =
        nifty.swingLow ??
        nifty.swing_low ??
        nifty.low;


    setText(
        "diagSwingLow",
        formatPrice(
            swingLow
        )
    );


    // ----------------------------------
    // PRICE
    // ----------------------------------

    setText(
        "diagPrice",
        formatPrice(
            price
        )
    );

}


// ======================================================
// PAPER TRADE SETUP
// ======================================================

function updateTradeSetup(
    price,
    signal
) {

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


    const nifty =
        state.indicators?.nifty ||
        {};


    // ==================================================
    // USE V6 ATR IF AVAILABLE
    // ==================================================

    const atr =
        Number(
            nifty.atr14 ??
            nifty.atr
        );


    let risk;


    if (
        Number.isFinite(atr) &&
        atr > 0
    ) {

        /*
        V6 risk model:

        Stop distance = 1.5 ATR
        Target distance = 3 ATR

        Risk / Reward = 1 : 2
        */

        risk =
            atr * 1.5;

    }

    else {

        /*
        Safe fallback
        */

        risk =
            price * 0.001;

    }


    const reward =
        risk * 2;


    const stop =
        signal === "STRONG BUY" ||
        signal === "BUY BIAS"

            ? price - risk

            : price + risk;


    const target =
        signal === "STRONG BUY" ||
        signal === "BUY BIAS"

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


// ======================================================
// TIME
// ======================================================

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


    state.lastUpdate =
        now;

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
                $("entry")?.textContent ||
                "--";


            const stop =
                $("stoploss")?.textContent ||
                "--";


            const target =
                $("target")?.textContent ||
                "--";


            alert(

                `PAPER TRADE ONLY\n\n` +

                `Signal: ${signal}\n` +

                `Entry: ${entry}\n` +

                `Stop Loss: ${stop}\n` +

                `Target: ${target}\n\n` +

                `No real order has been placed.`

            );

        }

    );

}


// ======================================================
// INITIALIZE
// ======================================================

async function initialize() {

    console.log(
        "================================"
    );


    console.log(
        "TradeMind Pro V6 started"
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


    // ------------------------------
    // FIRST DATA LOAD
    // ------------------------------

    await fetchMarketData();


    await fetchIndicatorData();


    updateTime();

}


// ======================================================
// LIVE REFRESH
// ======================================================

// Market prices every 5 seconds

setInterval(
    fetchMarketData,
    5000
);


// Indicators every 30 seconds

setInterval(
    fetchIndicatorData,
    30000
);


// Clock every second

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

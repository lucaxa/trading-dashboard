/*
TradeMind Pro
V8 Frontend Controller

INDstocks → Vercel → Dashboard

Features:
- Live NIFTY 50
- Live BANKNIFTY
- Historical candle fallback
- EMA 9
- EMA 21
- RSI 14
- VWAP
- ATR 14
- Swing High / Swing Low
- V8 Confirmation Strategy
- Buy / Sell Score
- Strategy Confidence
- Dynamic Entry / Stop Loss / Target
- Paper Trading Only

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
// FORMAT HELPERS
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

        }

    ) || null;

}


// ======================================================
// API FETCH
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


        console.log(
            "NIFTY quote price:",
            niftyPrice
        );


        console.log(
            "BANKNIFTY quote price:",
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


        updateStatusDot(
            true
        );


        updateBankTrend();


        updateTime();

    }

    catch (error) {

        console.error(
            "TradeMind quote error:",
            error
        );


        /*
        Keep indicator data alive.

        If live quote fails,
        indicator candle-close
        can continue providing
        analysis.
        */


        setText(
            "marketStatus",
            "INDICATORS LIVE"
        );


        setText(
            "dataStatus",
            "INDSTOCKS / FALLBACK"
        );


        updateStatusDot(
            true
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


    if (
        !Number.isFinite(current) ||
        !Number.isFinite(previous)
    ) {

        element.textContent =
            "Waiting for data";

        element.className =
            "change";

        return;

    }


    const difference =
        current - previous;


    if (difference === 0) {

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


        // ==================================================
        // CANDLE CLOSE FALLBACK
        // ==================================================

        const nifty =
            result.nifty || {};


        const bank =
            result.banknifty || {};


        const niftyCandle =
            nifty.lastCandle;


        const bankCandle =
            bank.lastCandle;


        const niftyFallback =
            Number(
                niftyCandle?.c
            );


        const bankFallback =
            Number(
                bankCandle?.c
            );


        if (
            !Number.isFinite(
                state.nifty?.price
            ) &&
            Number.isFinite(
                niftyFallback
            )
        ) {

            state.nifty = {

                price:
                    niftyFallback,

                previous:
                    niftyFallback

            };


            console.log(
                "Using NIFTY candle close fallback:",
                niftyFallback
            );

        }


        if (
            !Number.isFinite(
                state.banknifty?.price
            ) &&
            Number.isFinite(
                bankFallback
            )
        ) {

            state.banknifty = {

                price:
                    bankFallback,

                previous:
                    bankFallback

            };


            console.log(
                "Using BANKNIFTY candle close fallback:",
                bankFallback
            );

        }


        renderMarket();


        renderIndicators();


        analyzeMarket();


        renderV8Diagnostics();


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


    // ==================================================
    // NIFTY TREND
    // ==================================================

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


    // ==================================================
    // RSI MOMENTUM
    // ==================================================

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


    // ==================================================
    // VWAP
    // ==================================================

    const price =
        state.nifty?.price;


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


    // ==================================================
    // CANDLE COUNT
    // ==================================================

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
// V8 CONFIRMATION STRATEGY
// ======================================================

function analyzeMarket() {

    const nifty =
        state.indicators?.nifty;


    if (!nifty) {

        return;

    }


    // ==================================================
    // CORE INDICATORS
    // ==================================================

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


    const atr =
        Number(
            nifty.atr14 ??
            nifty.atr
        );


    const price =
        Number(
            state.nifty?.price
        );


    // ==================================================
    // LAST COMPLETED CANDLE
    // ==================================================

    const candle =
        nifty.lastCandle || {};


    const open =
        Number(
            candle.o
        );


    const high =
        Number(
            candle.h
        );


    const low =
        Number(
            candle.l
        );


    const close =
        Number(
            candle.c
        );


    console.log(
        "V8 Strategy Inputs:",
        {
            price,
            ema9,
            ema21,
            rsi,
            vwap,
            atr,
            open,
            high,
            low,
            close
        }
    );


    // ==================================================
    // VALIDATION
    // ==================================================

    if (
        !Number.isFinite(price) ||
        !Number.isFinite(ema9) ||
        !Number.isFinite(ema21) ||
        !Number.isFinite(rsi) ||
        !Number.isFinite(vwap)
    ) {

        setText(
            "signal",
            "WAIT"
        );


        setText(
            "strategyStatus",
            "WAITING FOR DATA"
        );


        setText(
            "buyScore",
            "--"
        );


        setText(
            "sellScore",
            "--"
        );


        setText(
            "confidence",
            "--"
        );


        return;

    }


    // ==================================================
    // SCORE
    // ==================================================

    let buyScore =
        0;


    let sellScore =
        0;


    const reasons = [];


    // ==================================================
    // 1 — EMA TREND
    // ==================================================

    const bullishTrend =
        ema9 > ema21;


    const bearishTrend =
        ema9 < ema21;


    if (bullishTrend) {

        buyScore++;

        reasons.push(
            "EMA bullish"
        );

    }


    else if (bearishTrend) {

        sellScore++;

        reasons.push(
            "EMA bearish"
        );

    }


    // ==================================================
    // 2 — RSI MOMENTUM
    // ==================================================

    const bullishMomentum =
        rsi >= 55 &&
        rsi < 70;


    const bearishMomentum =
        rsi <= 45 &&
        rsi > 30;


    if (bullishMomentum) {

        buyScore++;

        reasons.push(
            "RSI bullish"
        );

    }


    else if (bearishMomentum) {

        sellScore++;

        reasons.push(
            "RSI bearish"
        );

    }


    // ==================================================
    // 3 — VWAP POSITION
    // ==================================================

    const aboveVWAP =
        price > vwap;


    const belowVWAP =
        price < vwap;


    if (aboveVWAP) {

        buyScore++;

        reasons.push(
            "Price above VWAP"
        );

    }


    else if (belowVWAP) {

        sellScore++;

        reasons.push(
            "Price below VWAP"
        );

    }


    // ==================================================
    // 4 — CANDLE DIRECTION
    // ==================================================

    let candleBullish =
        false;


    let candleBearish =
        false;


    if (
        Number.isFinite(open) &&
        Number.isFinite(high) &&
        Number.isFinite(low) &&
        Number.isFinite(close)
    ) {

        candleBullish =
            close > open;


        candleBearish =
            close < open;


        if (candleBullish) {

            buyScore++;

            reasons.push(
                "Bullish candle"
            );

        }


        else if (candleBearish) {

            sellScore++;

            reasons.push(
                "Bearish candle"
            );

        }

    }


    // ==================================================
    // 5 — CANDLE STRENGTH
    // ==================================================

    let candleStrong =
        false;


    if (
        Number.isFinite(open) &&
        Number.isFinite(high) &&
        Number.isFinite(low) &&
        Number.isFinite(close)
    ) {

        const range =
            high - low;


        const body =
            Math.abs(
                close - open
            );


        if (
            range > 0 &&
            body / range >= 0.50
        ) {

            candleStrong =
                true;

        }

    }


    // ==================================================
    // SIGNAL
    // ==================================================

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


    // ==================================================
    // CONFIDENCE
    // ==================================================

    const maximumScore =
        Math.max(
            buyScore,
            sellScore
        );


    const confidenceMap = {

        0: 0,

        1: 20,

        2: 40,

        3: 60,

        4: 75,

        5: 90

    };


    let confidence =
        confidenceMap[
            maximumScore
        ] ?? 0;


    /*
    Conflicting signals reduce confidence.
    */


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


    // ==================================================
    // DISPLAY SCORE
    // ==================================================

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


    // ==================================================
    // DISPLAY SIGNAL
    // ==================================================

    setText(
        "signal",
        signal
    );


    // ==================================================
    // DISPLAY REASON
    // ==================================================

    const reasonText =
        signal === "WAIT"
            ? "Waiting for stronger confirmation"
            : reasons.join(" + ");


    setText(
        "signalReason",
        reasonText
    );


    // ==================================================
    // STRATEGY STATUS
    // ==================================================

    setText(

        "strategyStatus",

        signal === "WAIT"
            ? "WAITING FOR CONFIRMATION"
            : "ACTIVE — PAPER ANALYSIS"

    );


    // ==================================================
    // TRADE SETUP
    // ==================================================

    updateTradeSetup(
        price,
        signal
    );


    console.log(
        "V8 Strategy Result:",
        {
            signal,
            buyScore,
            sellScore,
            confidence,
            candleBullish,
            candleBearish,
            candleStrong
        }
    );

}


// ======================================================
// V8 DIAGNOSTICS
// ======================================================

function renderV8Diagnostics() {

    const nifty =
        state.indicators?.nifty;


    if (!nifty) {

        return;

    }


    const price =
        state.nifty?.price;


    setText(
        "diagPrice",
        formatPrice(
            price
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
        formatIndicator(
            nifty.rsi14
        )
    );


    setText(
        "diagVwap",
        formatPrice(
            nifty.vwap
        )
    );


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

}


// ======================================================
// PAPER TRADE SETUP
// ======================================================

function updateTradeSetup(
    price,
    signal
) {

    /*
    Never create a trade setup
    for WAIT.
    */


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


    const atr =
        Number(
            nifty.atr14 ??
            nifty.atr
        );


    let risk;


    /*
    ATR-based risk.

    1.5 × ATR gives the trade
    enough room for normal
    market movement.
    */


    if (
        Number.isFinite(atr) &&
        atr > 0
    ) {

        risk =
            atr * 1.5;

    }

    else {

        risk =
            price * 0.001;

    }


    const reward =
        risk * 2;


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
        formatPrice(
            price
        )
    );


    setText(
        "stoploss",
        formatPrice(
            stop
        )
    );


    setText(
        "target",
        formatPrice(
            target
        )
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
        "TradeMind Pro V8 started"
    );


    console.log(
        "Confirmation Strategy Active"
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


    /*
    Indicators load first.

    This allows the latest candle
    to become the fallback price
    if the quote endpoint is
    unavailable.
    */


    await fetchIndicatorData();


    /*
    Then attempt live quotes.
    */


    await fetchMarketData();


    updateTime();

}


// ======================================================
// REFRESH LOOPS
// ======================================================

/*
Live quotes:
every 5 seconds
*/

setInterval(
    fetchMarketData,
    5000
);


/*
Indicators:
every 30 seconds
*/

setInterval(
    fetchIndicatorData,
    30000
);


/*
Clock:
every second
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

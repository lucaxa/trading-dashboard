/*
TradeMind Pro
Frontend Controller
INDstocks → Vercel → Dashboard

V6 Strategy Engine

Indicators:
- EMA 9
- EMA 21
- RSI 14
- VWAP
- ATR 14
- Swing High
- Swing Low

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
        "LTP",
        "last_price",
        "lastPrice",
        "LastPrice",
        "price",
        "Price",
        "close",
        "Close",
        "lp",
        "last_traded_price",
        "lastTradedPrice",
        "last"

    ];

    for (const field of possibleFields) {

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


// ========================================
// TEXT NORMALIZATION
// ========================================

function normalizeText(value) {

    if (
        value === null ||
        value === undefined
    ) {

        return "";

    }

    return String(value)
        .toLowerCase()
        .replace(/[_-]/g, " ")
        .replace(/\s+/g, " ")
        .trim();

}


// ========================================
// QUOTE EXTRACTION
// ========================================

function extractQuotes(data) {

    if (Array.isArray(data)) {

        return data;

    }

    if (
        !data ||
        typeof data !== "object"
    ) {

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

function findInstrument(
    quotes,
    instrument
) {

    const wanted =
        normalizeText(instrument);

    return quotes.find(quote => {

        if (
            !quote ||
            typeof quote !== "object"
        ) {

            return false;

        }

        const text =
            normalizeText(
                JSON.stringify(quote)
            );

        // --------------------------------
        // NIFTY
        // --------------------------------

        if (wanted === "nifty") {

            const isBankNifty =

                text.includes("banknifty") ||
                text.includes("bank nifty") ||
                text.includes("nifty bank") ||
                text.includes("niftybank");

            if (isBankNifty) {

                return false;

            }

            return (

                text.includes("40000001") ||
                text.includes("nifty 50") ||
                text.includes("nifty50") ||
                (
                    text.includes("nifty") &&
                    !isBankNifty
                )

            );

        }

        // --------------------------------
        // BANKNIFTY
        // --------------------------------

        if (wanted === "banknifty") {

            return (

                text.includes("40000003") ||
                text.includes("banknifty") ||
                text.includes("bank nifty") ||
                text.includes("nifty bank") ||
                text.includes("niftybank")

            );

        }

        return false;

    }) || null;

}


// ========================================
// FIND OBJECT BY KEY
// ========================================

function findObjectByKey(
    object,
    possibleKeys
) {

    if (
        !object ||
        typeof object !== "object"
    ) {

        return null;

    }

    const keys =
        Object.keys(object);

    for (const key of keys) {

        const normalized =
            normalizeText(key)
                .replace(/\s/g, "");

        for (
            const possibleKey
            of possibleKeys
        ) {

            const wanted =
                normalizeText(
                    possibleKey
                )
                .replace(/\s/g, "");

            if (
                normalized === wanted
            ) {

                if (
                    object[key] &&
                    typeof object[key] === "object"
                ) {

                    return object[key];

                }

            }

        }

    }

    return null;

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

        console.log(
            "TradeMind NIFTY quote:",
            niftyQuote
        );

        console.log(
            "TradeMind BANKNIFTY quote:",
            bankQuote
        );

        const niftyPrice =
            extractPrice(
                niftyQuote
            );

        const bankPrice =
            extractPrice(
                bankQuote
            );

        if (niftyPrice !== null) {

            state.nifty = {

                price: niftyPrice,

                previous:
                    state.nifty?.price ??
                    niftyPrice

            };

        }

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

        // --------------------------------
        // FIND NIFTY
        // --------------------------------

        const niftyData =

            result.nifty ||

            result.NIFTY ||

            findObjectByKey(
                result,
                [
                    "nifty",
                    "NIFTY",
                    "nifty50",
                    "NIFTY50"
                ]
            ) ||

            {};

        // --------------------------------
        // FIND BANKNIFTY
        // --------------------------------

        const bankData =

            result.banknifty ||

            result.BANKNIFTY ||

            result["bank nifty"] ||

            result["NIFTY BANK"] ||

            result.niftyBank ||

            result.NIFTYBANK ||

            findObjectByKey(
                result,
                [
                    "banknifty",
                    "BANKNIFTY",
                    "bank nifty",
                    "NIFTY BANK",
                    "niftybank"
                ]
            ) ||

            {};

        // --------------------------------
        // STORE INDICATORS
        // --------------------------------

        state.indicators = {

            ...result,

            nifty: niftyData,

            banknifty: bankData

        };

        console.log(
            "TradeMind NIFTY indicators:",
            niftyData
        );

        console.log(
            "TradeMind BANKNIFTY indicators:",
            bankData
        );

        // ====================================
        // NIFTY CANDLE FALLBACK
        // ====================================

        const niftyCandle =

            niftyData.lastCandle ||

            niftyData.last_candle ||

            niftyData.latestCandle ||

            niftyData.latest_candle ||

            result.lastCandle ||

            result.last_candle ||

            result.data?.nifty?.lastCandle ||

            result.data?.NIFTY?.lastCandle ||

            null;

        if (niftyCandle) {

            const candlePrice =

                Number(

                    niftyCandle.c ??
                    niftyCandle.close ??
                    niftyCandle.Close ??
                    niftyCandle.ltp

                );

            if (
                Number.isFinite(candlePrice) &&
                candlePrice > 0
            ) {

                state.nifty = {

                    price: candlePrice,

                    previous:
                        state.nifty?.price ??
                        candlePrice

                };

                console.log(
                    "TradeMind NIFTY candle fallback:",
                    candlePrice
                );

            }

        }

        // ====================================
        // BANKNIFTY CANDLE FALLBACK
        // ====================================

        const bankCandle =

            bankData.lastCandle ||

            bankData.last_candle ||

            bankData.latestCandle ||

            bankData.latest_candle ||

            result.banknifty?.lastCandle ||

            result.BANKNIFTY?.lastCandle ||

            result.data?.banknifty?.lastCandle ||

            result.data?.BANKNIFTY?.lastCandle ||

            result.data?.["NIFTY BANK"]?.lastCandle ||

            result.data?.niftyBank?.lastCandle ||

            null;

        if (bankCandle) {

            const candlePrice =

                Number(

                    bankCandle.c ??
                    bankCandle.close ??
                    bankCandle.Close ??
                    bankCandle.ltp

                );

            if (
                Number.isFinite(candlePrice) &&
                candlePrice > 0
            ) {

                state.banknifty = {

                    price: candlePrice,

                    previous:
                        state.banknifty?.price ??
                        candlePrice

                };

                console.log(
                    "TradeMind BANKNIFTY candle fallback:",
                    candlePrice
                );

            }

        }

        renderMarket();

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

    const ema9 =
        Number(nifty.ema9);

    const ema21 =
        Number(nifty.ema21);

    const rsi =
        Number(nifty.rsi14);

    const vwap =
        Number(nifty.vwap);

    // --------------------------------
    // TREND
    // --------------------------------

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

    // --------------------------------
    // RSI
    // --------------------------------

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

    // --------------------------------
    // VWAP
    // --------------------------------

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

    // --------------------------------
    // CANDLE COUNT
    // --------------------------------

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
// V6 STRATEGY ENGINE
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

    // --------------------------------
    // INDICATORS
    // --------------------------------

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
        Number(
            state.nifty?.price
        );

    // --------------------------------
    // STRUCTURE
    // --------------------------------

    const swingHigh =
        Number(
            nifty.swingHigh?.price
        );

    const swingLow =
        Number(
            nifty.swingLow?.price
        );

    // --------------------------------
    // VALIDATION
    // --------------------------------

    if (
        !Number.isFinite(price) ||
        !Number.isFinite(ema9) ||
        !Number.isFinite(ema21) ||
        !Number.isFinite(rsi)
    ) {

        return {

            signal: "WAIT",

            reason:
                "Insufficient indicator data",

            price,
            ema9,
            ema21,
            rsi,
            vwap,
            atr,
            swingHigh,
            swingLow

        };

    }

    // ====================================
    // SCORE SYSTEM
    // ====================================

    let buyScore = 0;

    let sellScore = 0;

    const reasons = [];

    // --------------------------------
    // EMA TREND
    // --------------------------------

    if (ema9 > ema21) {

        buyScore += 2;

        reasons.push(
            "EMA bullish"
        );

    }

    else if (ema9 < ema21) {

        sellScore += 2;

        reasons.push(
            "EMA bearish"
        );

    }

    // --------------------------------
    // RSI
    // --------------------------------

    if (rsi >= 55) {

        buyScore += 2;

        reasons.push(
            "RSI bullish"
        );

    }

    else if (rsi <= 45) {

        sellScore += 2;

        reasons.push(
            "RSI bearish"
        );

    }

    // --------------------------------
    // VWAP
    // --------------------------------

    if (Number.isFinite(vwap)) {

        if (price > vwap) {

            buyScore += 1;

            reasons.push(
                "Above VWAP"
            );

        }

        else if (price < vwap) {

            sellScore += 1;

            reasons.push(
                "Below VWAP"
            );

        }

    }

    // --------------------------------
    // MARKET STRUCTURE
    // --------------------------------

    if (
        Number.isFinite(swingLow) &&
        price > swingLow
    ) {

        buyScore += 1;

    }

    if (
        Number.isFinite(swingHigh) &&
        price < swingHigh
    ) {

        sellScore += 1;

    }

    // ====================================
    // FINAL SIGNAL
    // ====================================

    let signal = "WAIT";

    let confidence = 0;

    if (
        buyScore >= 5 &&
        buyScore > sellScore
    ) {

        signal =
            buyScore >= 6
                ? "STRONG BUY"
                : "BUY";

        confidence =
            Math.min(
                95,
                50 + buyScore * 7
            );

    }

    else if (
        sellScore >= 5 &&
        sellScore > buyScore
    ) {

        signal =
            sellScore >= 6
                ? "STRONG SELL"
                : "SELL";

        confidence =
            Math.min(
                95,
                50 + sellScore * 7
            );

    }

    else {

        signal =
            "WAIT";

        confidence =
            Math.min(
                49,
                40 + Math.max(
                    buyScore,
                    sellScore
                ) * 3
            );

    }

    return {

        signal,

        confidence,

        buyScore,

        sellScore,

        reason:
            reasons.join(" + "),

        price,

        ema9,

        ema21,

        rsi,

        vwap,

        atr,

        swingHigh,

        swingLow

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
        "TradeMind V6 Strategy:",
        strategy
    );

    console.log(
        "================================"
    );

    // --------------------------------
    // SIGNAL
    // --------------------------------

    setText(
        "signal",
        strategy.signal
    );

    // --------------------------------
    // REASON
    // --------------------------------

    const reasonElement =
        $("signalReason");

    if (reasonElement) {

        reasonElement.textContent =
            strategy.reason ||
            "Waiting for confirmation";

    }

    // --------------------------------
    // STRATEGY STATUS
    // --------------------------------

    const strategyStatus =
        $("strategyStatus");

    if (strategyStatus) {

        strategyStatus.textContent =

            strategy.signal === "WAIT"

                ? "WAITING FOR CONFIRMATION"

                : "ACTIVE";

    }

    // --------------------------------
    // TRADE SETUP
    // --------------------------------

    updateTradeSetup(
        strategy
    );

}


// ========================================
// V6 DYNAMIC TRADE SETUP
// ========================================

function updateTradeSetup(strategy) {

    const price =
        Number(strategy.price);

    const atr =
        Number(strategy.atr);

    const swingHigh =
        Number(strategy.swingHigh);

    const swingLow =
        Number(strategy.swingLow);

    const signal =
        strategy.signal;

    // --------------------------------
    // NO VALID TRADE
    // --------------------------------

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

    // --------------------------------
    // ATR VALIDATION
    // --------------------------------

    if (
        !Number.isFinite(atr) ||
        atr <= 0
    ) {

        setText(
            "entry",
            formatPrice(price)
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

    // --------------------------------
    // ATR STOP DISTANCE
    //
    // Initial V6 model:
    //
    // 1.5 × ATR
    //
    // Structure is also considered.
    // --------------------------------

    const atrRisk =
        atr * 1.5;

    let stop = null;

    let target = null;

    // ====================================
    // BUY
    // ====================================

    if (
        signal === "BUY" ||
        signal === "STRONG BUY"
    ) {

        let structureStop =
            Number.isFinite(swingLow)
                ? swingLow
                : price - atrRisk;

        /*
        Never place a BUY stop above
        the entry.
        */

        if (
            structureStop >= price
        ) {

            structureStop =
                price - atrRisk;

        }

        /*
        Use the wider of ATR risk
        and structure protection.
        */

        const atrStop =
            price - atrRisk;

        stop =
            Math.min(
                atrStop,
                structureStop
            );

        const risk =
            price - stop;

        if (
            !Number.isFinite(risk) ||
            risk <= 0
        ) {

            return;

        }

        target =
            price +
            (
                risk * 2
            );

    }

    // ====================================
    // SELL
    // ====================================

    else if (
        signal === "SELL" ||
        signal === "STRONG SELL"
    ) {

        let structureStop =
            Number.isFinite(swingHigh)
                ? swingHigh
                : price + atrRisk;

        /*
        Never place a SELL stop
        below the entry.
        */

        if (
            structureStop <= price
        ) {

            structureStop =
                price + atrRisk;

        }

        const atrStop =
            price + atrRisk;

        stop =
            Math.max(
                atrStop,
                structureStop
            );

        const risk =
            stop - price;

        if (
            !Number.isFinite(risk) ||
            risk <= 0
        ) {

            return;

        }

        target =
            price -
            (
                risk * 2
            );

    }

    else {

        return;

    }

    // --------------------------------
    // FINAL RISK
    // --------------------------------

    const risk =
        Math.abs(
            price - stop
        );

    const reward =
        Math.abs(
            target - price
        );

    const rr =
        risk > 0
            ? reward / risk
            : 0;

    // --------------------------------
    // RENDER
    // --------------------------------

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
        `1 : ${rr.toFixed(2)}`
    );

}


// ========================================
// STATUS DOT
// ========================================

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
                $("entry")?.textContent ||
                "--";

            const stoploss =
                $("stoploss")?.textContent ||
                "--";

            const target =
                $("target")?.textContent ||
                "--";

            const riskReward =
                $("riskReward")?.textContent ||
                "--";

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
        "TradeMind Pro V6 started"
    );

    console.log(
        "ATR + Market Structure enabled"
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

    await fetchMarketData();

    await fetchIndicatorData();

    updateTime();

}


// ========================================
// MARKET REFRESH
// Every 5 seconds
// ========================================

setInterval(

    fetchMarketData,

    5000

);


// ========================================
// INDICATOR REFRESH
// Every 30 seconds
// ========================================

setInterval(

    fetchIndicatorData,

    30000

);


// ========================================
// START
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

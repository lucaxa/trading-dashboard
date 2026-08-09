/*
TradeMind Pro
V9 Frontend Controller

INDstocks → Vercel → Dashboard

V9 FEATURES:
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
- Historical Backtesting
- BUY / SELL simulation
- Entry / Stop Loss / Target
- Win Rate
- Profit Factor
- Max Drawdown
- Average Win / Loss
- Total Points

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

    connected: false,

    lastUpdate: null,

    backtest: null

};


// ======================================================
// DOM HELPERS
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


// V9 supports several possible IDs.
// This makes the controller safer if
// the HTML naming changed slightly.

function setTextAny(ids, value) {

    for (const id of ids) {

        const element = $(id);

        if (element) {

            element.textContent = value;

            return true;

        }

    }

    return false;

}


function getElementAny(ids) {

    for (const id of ids) {

        const element = $(id);

        if (element) {

            return element;

        }

    }

    return null;

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


function formatPoints(value) {

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
// LIVE MARKET DATA
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


        updateBankTrend();


        updateTime();

    }

    catch (error) {

        console.error(
            "TradeMind quote error:",
            error
        );


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
// FETCH INDICATORS
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
            "TradeMind V9 indicators:",
            result
        );


        const nifty =
            result.nifty || {};


        const bank =
            result.banknifty || {};


        // ==================================================
        // FALLBACK PRICE
        // ==================================================

        const niftyFallback =
            Number(
                nifty.lastCandle?.c
            );


        const bankFallback =
            Number(
                bank.lastCandle?.c
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

        }


        renderMarket();

        renderIndicators();

        analyzeMarket();

        renderV9Diagnostics();

        inspectHistoricalData();


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


    const candleCount =
        Number(
            nifty.candleCount
        );


    if (
        Number.isFinite(candleCount)
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
// V8 LIVE STRATEGY
// ======================================================

function analyzeMarket() {

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


    const price =
        Number(
            state.nifty?.price
        );


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

        return;

    }


    let buyScore = 0;

    let sellScore = 0;

    const reasons = [];


    // EMA

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


    // Candle direction

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


    // Candle strength

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


    // Signal

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


    // Confidence

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
            Math.max(
                buyScore,
                sellScore
            )
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


    const fill =
        $("confidenceFill");


    if (fill) {

        fill.style.width =
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
        signal
    );

}


// ======================================================
// V9 DIAGNOSTICS
// ======================================================

function renderV9Diagnostics() {

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


    setText(

        "diagAtr",

        formatIndicator(
            nifty.atr14 ??
            nifty.atr
        )

    );


    const swingHigh =
        nifty.swingHigh;


    const swingLow =
        nifty.swingLow;


    setText(

        "diagSwingHigh",

        formatPrice(
            swingHigh?.price ??
            swingHigh
        )

    );


    setText(

        "diagSwingLow",

        formatPrice(
            swingLow?.price ??
            swingLow
        )

    );

}


// ======================================================
// TRADE SETUP
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


    const atr =
        Number(
            nifty.atr14 ??
            nifty.atr
        );


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
// V9 HISTORICAL DATA CHECK
// ======================================================

function getHistoricalCandles() {

    const nifty =
        state.indicators?.nifty;


    if (!nifty) {

        return [];

    }


    const possibleArrays = [

        nifty.candles,

        nifty.historicalCandles,

        nifty.history,

        nifty.data

    ];


    for (
        const candles of possibleArrays
    ) {

        if (
            Array.isArray(candles) &&
            candles.length > 0
        ) {

            return candles;

        }

    }


    return [];

}


// ======================================================
// INSPECT HISTORICAL DATA
// ======================================================

function inspectHistoricalData() {

    const candles =
        getHistoricalCandles();


    console.log(

        "V9 historical candle count:",

        candles.length

    );


    if (candles.length > 0) {

        setTextAny(

            [
                "backtestStatus",
                "v9BacktestStatus"
            ],

            `${candles.length} historical candles available`

        );

    }

}


// ======================================================
// BACKTEST EMA
// ======================================================

function calculateEMA(
    values,
    period
) {

    if (
        values.length < period
    ) {

        return null;

    }


    const multiplier =
        2 / (period + 1);


    let value =

        values
            .slice(0, period)
            .reduce(
                (sum, item) =>
                    sum + item,
                0
            ) / period;


    for (
        let i = period;
        i < values.length;
        i++
    ) {

        value =

            (
                values[i] - value
            ) *
            multiplier +
            value;

    }


    return value;

}


// ======================================================
// BACKTEST RSI
// ======================================================

function calculateRSI(
    values,
    period = 14
) {

    if (
        values.length <
        period + 1
    ) {

        return null;

    }


    let gains = 0;

    let losses = 0;


    for (
        let i = 1;
        i <= period;
        i++
    ) {

        const change =
            values[i] -
            values[i - 1];


        if (change > 0) {

            gains += change;

        }

        else {

            losses +=
                Math.abs(change);

        }

    }


    let averageGain =
        gains / period;


    let averageLoss =
        losses / period;


    for (
        let i = period + 1;
        i < values.length;
        i++
    ) {

        const change =
            values[i] -
            values[i - 1];


        const gain =
            Math.max(
                change,
                0
            );


        const loss =
            Math.max(
                -change,
                0
            );


        averageGain =

            (
                averageGain *
                (period - 1) +
                gain
            ) / period;


        averageLoss =

            (
                averageLoss *
                (period - 1) +
                loss
            ) / period;

    }


    if (
        averageLoss === 0
    ) {

        return 100;

    }


    const rs =
        averageGain /
        averageLoss;


    return (

        100 -
        100 /
        (1 + rs)

    );

}


// ======================================================
// IST SESSION DATE
// ======================================================

function getISTDate(ts) {

    const date =
        new Date(
            Number(ts) * 1000
        );


    const utc =
        date.getTime();


    return new Date(

        utc +
        (
            5.5 *
            60 *
            60 *
            1000
        )

    )
        .toISOString()
        .slice(0, 10);

}


// ======================================================
// BACKTEST VWAP
// ======================================================

function calculateVWAP(
    candles
) {

    if (
        !candles.length
    ) {

        return null;

    }


    const latest =
        candles[
            candles.length - 1
        ];


    const sessionDate =
        getISTDate(
            latest.ts
        );


    let totalTPV = 0;

    let totalVolume = 0;


    for (
        const candle of candles
    ) {

        if (
            getISTDate(
                candle.ts
            ) !== sessionDate
        ) {

            continue;

        }


        const high =
            Number(candle.h);


        const low =
            Number(candle.l);


        const close =
            Number(candle.c);


        const volume =
            Number(candle.v);


        if (

            !Number.isFinite(high) ||
            !Number.isFinite(low) ||
            !Number.isFinite(close) ||
            !Number.isFinite(volume)

        ) {

            continue;

        }


        const typicalPrice =

            (
                high +
                low +
                close
            ) / 3;


        totalTPV +=

            typicalPrice *
            volume;


        totalVolume +=
            volume;

    }


    if (
        totalVolume === 0
    ) {

        return null;

    }


    return (
        totalTPV /
        totalVolume
    );

}


// ======================================================
// BACKTEST ATR
// ======================================================

function calculateATR(
    candles,
    period = 14
) {

    if (
        candles.length <
        period + 1
    ) {

        return null;

    }


    const ranges = [];


    for (
        let i = 1;
        i < candles.length;
        i++
    ) {

        const current =
            candles[i];


        const previous =
            candles[i - 1];


        const high =
            Number(current.h);


        const low =
            Number(current.l);


        const previousClose =
            Number(previous.c);


        if (

            !Number.isFinite(high) ||
            !Number.isFinite(low)

        ) {

            continue;

        }


        const range1 =
            high - low;


        const range2 =

            Number.isFinite(
                previousClose
            )

                ? Math.abs(
                    high -
                    previousClose
                )

                : range1;


        const range3 =

            Number.isFinite(
                previousClose
            )

                ? Math.abs(
                    low -
                    previousClose
                )

                : range1;


        ranges.push(

            Math.max(
                range1,
                range2,
                range3
            )

        );

    }


    if (
        ranges.length < period
    ) {

        return null;

    }


    let atrValue =

        ranges
            .slice(0, period)
            .reduce(
                (sum, value) =>
                    sum + value,
                0
            ) / period;


    for (
        let i = period;
        i < ranges.length;
        i++
    ) {

        atrValue =

            (
                atrValue *
                (period - 1) +
                ranges[i]
            ) / period;

    }


    return atrValue;

}


// ======================================================
// HISTORICAL STRATEGY
// ======================================================

function evaluateHistoricalCandle(
    candles,
    index
) {

    if (
        index < 21
    ) {

        return null;

    }


    const history =
        candles.slice(
            0,
            index + 1
        );


    const candle =
        candles[index];


    const closes =
        history.map(
            item =>
                Number(item.c)
        );


    const ema9 =
        calculateEMA(
            closes,
            9
        );


    const ema21 =
        calculateEMA(
            closes,
            21
        );


    const rsi =
        calculateRSI(
            closes,
            14
        );


    const vwap =
        calculateVWAP(
            history
        );


    const atr =
        calculateATR(
            history,
            14
        );


    const open =
        Number(candle.o);


    const high =
        Number(candle.h);


    const low =
        Number(candle.l);


    const close =
        Number(candle.c);


    if (

        !Number.isFinite(ema9) ||
        !Number.isFinite(ema21) ||
        !Number.isFinite(rsi) ||
        !Number.isFinite(vwap) ||
        !Number.isFinite(close)

    ) {

        return null;

    }


    let buyScore = 0;

    let sellScore = 0;


    // EMA

    if (ema9 > ema21) {

        buyScore++;

    }

    else if (ema9 < ema21) {

        sellScore++;

    }


    // RSI

    if (
        rsi >= 55 &&
        rsi < 70
    ) {

        buyScore++;

    }

    else if (
        rsi <= 45 &&
        rsi > 30
    ) {

        sellScore++;

    }


    // VWAP

    if (close > vwap) {

        buyScore++;

    }

    else if (close < vwap) {

        sellScore++;

    }


    // Candle

    const bullishCandle =
        close > open;


    const bearishCandle =
        close < open;


    if (bullishCandle) {

        buyScore++;

    }

    else if (bearishCandle) {

        sellScore++;

    }


    // Candle strength

    let strongCandle =
        false;


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

        strongCandle =
            true;

    }


    // Signal

    let signal =
        "WAIT";


    if (

        buyScore >= 4 &&
        buyScore > sellScore

    ) {

        signal =
            strongCandle
                ? "STRONG BUY"
                : "BUY BIAS";

    }

    else if (

        sellScore >= 4 &&
        sellScore > buyScore

    ) {

        signal =
            strongCandle
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


    return {

        signal,

        buyScore,

        sellScore,

        confidence:
            signal === "WAIT"
                ? 0
                : Math.max(
                    buyScore,
                    sellScore
                ),

        entry:
            close,

        atr

    };

}


// ======================================================
// SIMULATE TRADE
// ======================================================

function simulateTrade(
    candles,
    entryIndex,
    strategy
) {

    if (
        !strategy ||
        strategy.signal === "WAIT"
    ) {

        return null;

    }


    const entry =
        Number(
            strategy.entry
        );


    const atr =
        Number(
            strategy.atr
        );


    if (
        !Number.isFinite(entry)
    ) {

        return null;

    }


    const risk =

        Number.isFinite(atr) &&
        atr > 0

            ? atr * 1.5

            : entry * 0.001;


    const reward =
        risk * 2;


    const bullish =

        strategy.signal === "BUY BIAS" ||
        strategy.signal === "STRONG BUY";


    const stop =

        bullish
            ? entry - risk
            : entry + risk;


    const target =

        bullish
            ? entry + reward
            : entry - reward;


    for (

        let i =
            entryIndex + 1;

        i < candles.length;

        i++

    ) {

        const candle =
            candles[i];


        const high =
            Number(candle.h);


        const low =
            Number(candle.l);


        const close =
            Number(candle.c);


        if (

            !Number.isFinite(high) ||
            !Number.isFinite(low) ||
            !Number.isFinite(close)

        ) {

            continue;

        }


        // ==================================================
        // BUY
        // ==================================================

        if (bullish) {

            const stopHit =
                low <= stop;


            const targetHit =
                high >= target;


            /*
            Conservative rule:
            if both are hit in the same
            candle, assume STOP first.
            */

            if (stopHit) {

                return {

                    signal:
                        strategy.signal,

                    entry,

                    stop,

                    target,

                    exit:
                        stop,

                    points:
                        stop - entry,

                    result:
                        "LOSS",

                    entryIndex,

                    exitIndex:
                        i

                };

            }


            if (targetHit) {

                return {

                    signal:
                        strategy.signal,

                    entry,

                    stop,

                    target,

                    exit:
                        target,

                    points:
                        target - entry,

                    result:
                        "WIN",

                    entryIndex,

                    exitIndex:
                        i

                };

            }

        }


        // ==================================================
        // SELL
        // ==================================================

        else {

            const stopHit =
                high >= stop;


            const targetHit =
                low <= target;


            /*
            Conservative:
            STOP first if both touched.
            */

            if (stopHit) {

                return {

                    signal:
                        strategy.signal,

                    entry,

                    stop,

                    target,

                    exit:
                        stop,

                    points:
                        entry - stop,

                    result:
                        "LOSS",

                    entryIndex,

                    exitIndex:
                        i

                };

            }


            if (targetHit) {

                return {

                    signal:
                        strategy.signal,

                    entry,

                    stop,

                    target,

                    exit:
                        target,

                    points:
                        entry - target,

                    result:
                        "WIN",

                    entryIndex,

                    exitIndex:
                        i

                };

            }

        }

    }


    // ==================================================
    // END OF DATA
    // ==================================================

    const finalCandle =
        candles[
            candles.length - 1
        ];


    const finalClose =
        Number(
            finalCandle.c
        );


    if (
        !Number.isFinite(
            finalClose
        )
    ) {

        return null;

    }


    const points =

        bullish

            ? finalClose - entry

            : entry - finalClose;


    return {

        signal:
            strategy.signal,

        entry,

        stop,

        target,

        exit:
            finalClose,

        points,

        result:
            points >= 0
                ? "WIN"
                : "LOSS",

        entryIndex,

        exitIndex:
            candles.length - 1

    };

}


// ======================================================
// RUN V9 BACKTEST
// ======================================================

async function runV9Backtest() {

    const button =
        getElementAny(

            [
                "runV9Backtest",
                "v9BacktestBtn",
                "backtestBtn"
            ]

        );


    if (button) {

        button.disabled =
            true;


        button.textContent =
            "RUNNING V9 BACKTEST...";

    }


    setTextAny(

        [
            "backtestStatus",
            "v9BacktestStatus"
        ],

        "Loading historical candles..."

    );


    try {

        /*
        Make sure fresh indicator
        data exists.
        */

        await fetchIndicatorData();


        const candles =
            getHistoricalCandles();


        console.log(
            "V9 BACKTEST CANDLES:",
            candles
        );


        if (
            !Array.isArray(candles) ||
            candles.length < 30
        ) {

            throw new Error(

                "Historical candle data unavailable. The API must return nifty.candles."

            );

        }


        /*
        Sort chronologically.
        */

        const sortedCandles =
            [...candles].sort(

                (a, b) =>

                    Number(a.ts) -
                    Number(b.ts)

            );


        const trades = [];


        /*
        Only one trade at a time.
        */

        let index = 21;


        while (
            index <
            sortedCandles.length - 1
        ) {

            const strategy =
                evaluateHistoricalCandle(

                    sortedCandles,

                    index

                );


            if (
                strategy &&
                strategy.signal !== "WAIT"
            ) {

                const trade =
                    simulateTrade(

                        sortedCandles,

                        index,

                        strategy

                    );


                if (trade) {

                    trades.push(
                        trade
                    );


                    /*
                    Jump to the candle
                    after the trade exits.
                    */

                    index =
                        trade.exitIndex + 1;


                    continue;

                }

            }


            index++;

        }


        const stats =
            calculateBacktestStats(

                sortedCandles,

                trades

            );


        state.backtest =
            stats;


        renderBacktest(
            stats
        );


        console.log(
            "================================"
        );


        console.log(
            "V9 BACKTEST COMPLETE"
        );


        console.log(
            stats
        );


        console.log(
            "================================"
        );

    }

    catch (error) {

        console.error(
            "V9 backtest error:",
            error
        );


        setTextAny(

            [
                "backtestStatus",
                "v9BacktestStatus"
            ],

            `Backtest Error: ${error.message}`

        );

    }

    finally {

        if (button) {

            button.disabled =
                false;


            button.textContent =
                "RUN V9 BACKTEST";

        }

    }

}


// ======================================================
// BACKTEST STATISTICS
// ======================================================

function calculateBacktestStats(
    candles,
    trades
) {

    const totalTrades =
        trades.length;


    const buyTrades =
        trades.filter(

            trade =>

                trade.signal === "BUY BIAS" ||
                trade.signal === "STRONG BUY"

        );


    const sellTrades =
        trades.filter(

            trade =>

                trade.signal === "SELL BIAS" ||
                trade.signal === "STRONG SELL"

        );


    const winningTrades =
        trades.filter(

            trade =>
                trade.result === "WIN"

        );


    const losingTrades =
        trades.filter(

            trade =>
                trade.result === "LOSS"

        );


    const totalPoints =
        trades.reduce(

            (sum, trade) =>
                sum + trade.points,

            0

        );


    const winningPoints =
        winningTrades.reduce(

            (sum, trade) =>
                sum + trade.points,

            0

        );


    const losingPoints =
        losingTrades.reduce(

            (sum, trade) =>
                sum + trade.points,

            0

        );


    const averageWin =

        winningTrades.length > 0

            ? winningPoints /
              winningTrades.length

            : 0;


    const averageLoss =

        losingTrades.length > 0

            ? Math.abs(
                losingPoints /
                losingTrades.length
            )

            : 0;


    const profitFactor =

        losingPoints < 0

            ? winningPoints /
              Math.abs(losingPoints)

            : winningPoints > 0
                ? Infinity
                : 0;


    const winRate =

        totalTrades > 0

            ? (
                winningTrades.length /
                totalTrades
            ) * 100

            : 0;


    // ==================================================
    // EQUITY / DRAWDOWN
    // ==================================================

    let equity = 0;

    let peak = 0;

    let maxDrawdown = 0;


    for (
        const trade of trades
    ) {

        equity +=
            trade.points;


        peak =
            Math.max(
                peak,
                equity
            );


        const drawdown =
            peak - equity;


        maxDrawdown =
            Math.max(
                maxDrawdown,
                drawdown
            );

    }


    return {

        candlesTested:
            candles.length,

        totalTrades,

        buyTrades:
            buyTrades.length,

        sellTrades:
            sellTrades.length,

        winningTrades:
            winningTrades.length,

        losingTrades:
            losingTrades.length,

        winRate,

        totalPoints,

        averageWin,

        averageLoss,

        profitFactor,

        maxDrawdown,

        finalEquity:
            equity,

        trades

    };

}


// ======================================================
// RENDER BACKTEST
// ======================================================

function renderBacktest(
    stats
) {

    if (!stats) {

        return;

    }


    setTextAny(

        [
            "backtestCandles",
            "candlesTested",
            "v9Candles"
        ],

        stats.candlesTested

    );


    setTextAny(

        [
            "backtestTrades",
            "totalTrades",
            "v9TotalTrades"
        ],

        stats.totalTrades

    );


    setTextAny(

        [
            "backtestBuyTrades",
            "buyTrades",
            "v9BuyTrades"
        ],

        stats.buyTrades

    );


    setTextAny(

        [
            "backtestSellTrades",
            "sellTrades",
            "v9SellTrades"
        ],

        stats.sellTrades

    );


    setTextAny(

        [
            "backtestWinningTrades",
            "winningTrades",
            "v9WinningTrades"
        ],

        stats.winningTrades

    );


    setTextAny(

        [
            "backtestLosingTrades",
            "losingTrades",
            "v9LosingTrades"
        ],

        stats.losingTrades

    );


    setTextAny(

        [
            "backtestWinRate",
            "winRate",
            "v9WinRate"
        ],

        `${stats.winRate.toFixed(2)}%`

    );


    setTextAny(

        [
            "backtestTotalPoints",
            "totalPoints",
            "v9TotalPoints"
        ],

        formatPoints(
            stats.totalPoints
        )

    );


    setTextAny(

        [
            "backtestAverageWin",
            "averageWin",
            "v9AverageWin"
        ],

        formatPoints(
            stats.averageWin
        )

    );


    setTextAny(

        [
            "backtestAverageLoss",
            "averageLoss",
            "v9AverageLoss"
        ],

        formatPoints(
            stats.averageLoss
        )

    );


    setTextAny(

        [
            "backtestProfitFactor",
            "profitFactor",
            "v9ProfitFactor"
        ],

        Number.isFinite(
            stats.profitFactor
        )

            ? stats.profitFactor.toFixed(2)

            : "∞"

    );


    setTextAny(

        [
            "backtestMaxDrawdown",
            "maxDrawdown",
            "v9MaxDrawdown"
        ],

        formatPoints(
            stats.maxDrawdown
        )

    );


    setTextAny(

        [
            "backtestStatus",
            "v9BacktestStatus"
        ],

        `BACKTEST COMPLETE — ${stats.candlesTested} CANDLES TESTED`

    );


    setTextAny(

        [
            "backtestEngine",
            "v9BacktestEngine"
        ],

        "V9 Historical Simulation"

    );


    console.log(
        "V9 rendered statistics:",
        stats
    );

}


// ======================================================
// BACKTEST BUTTON
// ======================================================

function setupBacktestButton() {

    const button =
        getElementAny(

            [
                "runV9Backtest",
                "v9BacktestBtn",
                "backtestBtn"
            ]

        );


    if (!button) {

        console.warn(
            "V9 backtest button not found."
        );


        return;

    }


    button.addEventListener(

        "click",

        runV9Backtest

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
        "TradeMind Pro V9 started"
    );


    console.log(
        "V8 Confirmation Strategy"
    );


    console.log(
        "V9 Historical Backtest Engine"
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

    setupBacktestButton();


    /*
    Load indicators first.
    */

    await fetchIndicatorData();


    /*
    Then live quotes.
    */

    await fetchMarketData();


    updateTime();

}


// ======================================================
// REFRESH LOOPS
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

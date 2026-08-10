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

Dhan → Vercel
        ↓
  5-minute Historical Candles
        ↓
Dhan vs INDstocks Comparison

PAPER TRADING ONLY.
NO REAL ORDERS.
*/

"use strict";

console.log("🔥 V10.1 SCRIPT LOADED");
console.log("🔥 TradeMind Pro frontend controller starting");

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
    const elements = document.querySelectorAll(`[id="${id}"]`);

    if (!elements.length) return;

    elements.forEach(element => {
        element.textContent = value;
    });
}

function setMultipleText(ids, value) {
    ids.forEach(id => setText(id, value));
}

// ======================================================
// FORMATTING
// ======================================================

function formatPrice(value) {
    const number = Number(value);

    if (!Number.isFinite(number)) return "--";

    return number.toLocaleString("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function formatNumber(value) {
    const number = Number(value);

    if (!Number.isFinite(number)) return "--";

    return number.toFixed(2);
}

function formatPercent(value) {
    const number = Number(value);

    if (!Number.isFinite(number)) return "--";

    return `${number.toFixed(2)}%`;
}

// ======================================================
// API FETCH
// ======================================================

async function apiFetch(url, timeoutMs = 15000) {

    console.log("================================");
    console.log("TradeMind API REQUEST:", url);
    console.log("================================");

    const controller = new AbortController();

    const timeout = setTimeout(() => {
        controller.abort();
    }, timeoutMs);

    try {

        const response = await fetch(url, {
            method: "GET",
            cache: "no-store",

            headers: {
                "Accept": "application/json",
                "Cache-Control": "no-cache",
                "Pragma": "no-cache"
            },

            signal: controller.signal
        });

        const text = await response.text();

        console.log(
            "TradeMind API HTTP status:",
            response.status
        );

        console.log(
            "TradeMind API raw response:",
            text.slice(0, 5000)
        );

        let data;

        try {
            data = JSON.parse(text);
        }

        catch {
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

            if (typeof data?.error === "string") {
                message = data.error;
            }

            else {
                message = JSON.stringify(
                    data?.error || data
                );
            }

            throw new Error(
                message ||
                `API HTTP error ${response.status}`
            );
        }

        if (data && data.success === false) {

            const message =
                typeof data.error === "string"
                    ? data.error
                    : JSON.stringify(
                        data.error || data
                    );

            throw new Error(
                message ||
                "API returned success:false"
            );
        }

        return data;

    }

    catch (error) {

        if (error?.name === "AbortError") {

            throw new Error(
                `API request timed out after ${timeoutMs / 1000} seconds`
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

        const value = Number(
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
                result?.data ?? result
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
                price: niftyPrice,
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

    if (!element) return;

    if (
        !Number.isFinite(current) ||
        !Number.isFinite(previous)
    ) {

        element.textContent =
            "Waiting for data";

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
            result?.nifty || {};

        const bank =
            result?.banknifty || {};

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
                price: niftyClose,
                previous: niftyClose
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
                price: bankClose,
                previous: bankClose
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

    if (!nifty) return;

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

    if (!bank) return;

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
// STRATEGY
// ======================================================

function analyzeMarket() {

    const nifty =
        state.indicators?.nifty;

    if (!nifty) return;

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
        setText("strategyStatus", "WAITING FOR DATA");
        setText("buyScore", "--");
        setText("sellScore", "--");
        setText("confidence", "--");

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

    // CANDLE

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
            (
                body / range
            ) >= 0.50;
    }

    // SIGNAL

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

    let risk;

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

    if (!nifty) return;

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
// BACKTEST ID COMPATIBILITY
// ======================================================

const BACKTEST_IDS = {

    candles: [
        "btCandles",
        "candlesTested"
    ],

    trades: [
        "btTrades",
        "totalTrades"
    ],

    buyTrades: [
        "btBuyTrades",
        "buyTrades"
    ],

    sellTrades: [
        "btSellTrades",
        "sellTrades"
    ],

    wins: [
        "btWins",
        "winningTrades"
    ],

    losses: [
        "btLosses",
        "losingTrades"
    ],

    winRate: [
        "btWinRate",
        "winRate"
    ],

    points: [
        "btPoints",
        "totalPoints"
    ],

    avgWin: [
        "btAvgWin",
        "averageWin"
    ],

    avgLoss: [
        "btAvgLoss",
        "averageLoss"
    ],

    profitFactor: [
        "btProfitFactor",
        "profitFactor"
    ],

    drawdown: [
        "btDrawdown",
        "maxDrawdown"
    ],

    status: [
        "btStatus",
        "backtestStatus"
    ],

    engine: [
        "btEngine",
        "backtestEngine"
    ]
};

// ======================================================
// BACKTEST DISPLAY HELPER
// ======================================================

function setBacktestField(
    field,
    value
) {

    const ids =
        BACKTEST_IDS[field] || [];

    ids.forEach(
        id => {

            setText(
                id,
                value
            );

        }
    );
}

// ======================================================
// V10.1 BACKTEST
// ======================================================

async function runV10Backtest() {

    console.log(
        "🔥🔥🔥 V10.1 BACKTEST BUTTON CLICKED 🔥🔥🔥"
    );

    if (state.backtestRunning) {

        console.log(
            "V10.1 backtest already running."
        );

        return;
    }

    state.backtestRunning = true;

    const button =
        $("runBacktestBtn") ||
        $("runV10Backtest") ||
        $("runV9Backtest");

    if (button) {

        button.disabled = true;

        button.textContent =
            "RUNNING V10.1 BACKTEST...";
    }

    resetBacktestDisplay();

    setBacktestField(
        "status",
        "Fetching fresh V10.1 historical data..."
    );

    setBacktestField(
        "engine",
        "V10.1 Historical Simulation — RUNNING"
    );

    try {

        const cacheBust =
            Date.now();

        const apiUrl =
            `/api/backtest?interval=5minute&_t=${cacheBust}`;

        setBacktestField(
            "status",
            "Calling V10.1 historical backtest API..."
        );

        const result =
            await apiFetch(
                apiUrl,
                30000
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

        renderBacktest(result);

    }

    catch (error) {

        console.error(
            "🔥 V10.1 BACKTEST ERROR",
            error
        );

        const message =
            error?.message ||
            "Unknown backtest error";

        setBacktestField(
            "status",
            `BACKTEST ERROR: ${message}`
        );

        setBacktestField(
            "engine",
            "V10.1 Historical Simulation — ERROR"
        );

    }

    finally {

        state.backtestRunning = false;

        if (button) {

            button.disabled = false;

            button.textContent =
                "RUN V10.1 BACKTEST";
        }
    }
}

// ======================================================
// RESET BACKTEST DISPLAY
// ======================================================

function resetBacktestDisplay() {

    setBacktestField("candles", "--");
    setBacktestField("trades", "--");
    setBacktestField("buyTrades", "--");
    setBacktestField("sellTrades", "--");
    setBacktestField("wins", "--");
    setBacktestField("losses", "--");
    setBacktestField("winRate", "--");
    setBacktestField("points", "--");
    setBacktestField("avgWin", "--");
    setBacktestField("avgLoss", "--");
    setBacktestField("profitFactor", "--");
    setBacktestField("drawdown", "--");

    const container =
        $("tradeHistory") ||
        $("tradeHistoryTable") ||
        $("tradeList");

    if (
        container &&
        container.tagName !== "TABLE"
    ) {

        container.innerHTML =
            `<div class="trade-history-row">
                Waiting for V10.1 backtest...
            </div>`;
    }
}

// ======================================================
// SAFE STATISTIC
// ======================================================

function safeStatistic(value) {

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

function renderBacktest(result) {

    if (!result) return;

    const version =
        result.version ||
        "V10.1";

    setBacktestField(
        "engine",
        `${version} Historical Simulation`
    );

    const candles =
        safeStatistic(
            result.candlesTested
        );

    setBacktestField(
        "candles",
        candles ?? "--"
    );

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

    setBacktestField(
        "trades",
        totalTrades ?? "--"
    );

    setBacktestField(
        "buyTrades",
        buyTrades ?? "--"
    );

    setBacktestField(
        "sellTrades",
        sellTrades ?? "--"
    );

    const winningTrades =
        safeStatistic(
            result.winningTrades
        );

    const losingTrades =
        safeStatistic(
            result.losingTrades
        );

    setBacktestField(
        "wins",
        winningTrades ?? "--"
    );

    setBacktestField(
        "losses",
        losingTrades ?? "--"
    );

    const winRate =
        Number(
            result.winRate
        );

    setBacktestField(
        "winRate",
        Number.isFinite(winRate)
            ? `${winRate.toFixed(2)}%`
            : "--"
    );

    setBacktestField(
        "points",
        formatNumber(
            result.totalPoints
        )
    );

    setBacktestField(
        "avgWin",
        formatNumber(
            result.averageWin
        )
    );

    setBacktestField(
        "avgLoss",
        formatNumber(
            result.averageLoss
        )
    );

    const pf =
        Number(
            result.profitFactor
        );

    if (
        result.profitFactor === Infinity ||
        result.profitFactor === "Infinity"
    ) {

        setBacktestField(
            "profitFactor",
            "∞"
        );

    }

    else if (
        Number.isFinite(pf)
    ) {

        setBacktestField(
            "profitFactor",
            pf.toFixed(2)
        );

    }

    else {

        setBacktestField(
            "profitFactor",
            "--"
        );
    }

    setBacktestField(
        "drawdown",
        formatNumber(
            result.maxDrawdown
        )
    );

    if (
        result.status ===
        "INSUFFICIENT_DATA"
    ) {

        setBacktestField(
            "status",
            `INSUFFICIENT DATA — ${candles ?? 0} candles`
        );

    }

    else if (
        result.status ===
        "COMPLETED"
    ) {

        setBacktestField(
            "status",
            `V10.1 BACKTEST COMPLETE — ${totalTrades ?? 0} trades simulated`
        );

    }

    else {

        setBacktestField(
            "status",
            `V10.1 BACKTEST RESULT — ${totalTrades ?? 0} trades`
        );
    }

    setBacktestField(
        "engine",
        `${version} Historical Simulation`
    );

    if (
        Array.isArray(
            result.trades
        )
    ) {

        state.backtest =
            result;

        console.table(
            result.trades
        );

        renderTradeHistory(
            result.trades
        );
    }
}

// ======================================================
// TRADE HISTORY
// ======================================================

function renderTradeHistory(trades) {

    if (!Array.isArray(trades)) return;

    const container =
        $("tradeHistory") ||
        $("tradeHistoryTable") ||
        $("tradeList");

    if (!container) return;

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

                tbody.appendChild(row);
            }
        );

        return;
    }

    container.innerHTML = "";

    trades.forEach(
        (trade, index) => {

            const row =
                document.createElement(
                    "div"
                );

            row.className =
                "trade-history-row";

            row.style.whiteSpace =
                "pre-line";

            row.style.padding =
                "16px";

            row.style.marginBottom =
                "12px";

            row.style.border =
                "1px solid #1e293b";

            row.style.borderRadius =
                "12px";

            row.style.background =
                "#0b1220";

            row.textContent =

                `#${index + 1}\n` +

                `${trade.side ?? "--"} |\n` +

                `Entry\n` +

                `${formatPrice(trade.entry)}\n` +

                `| Exit\n` +

                `${formatPrice(trade.exit)}\n` +

                `| ${formatNumber(trade.points)} pts |\n` +

                `${trade.result ?? "--"} |\n` +

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

    const button =
        $("runBacktestBtn") ||
        $("runV10Backtest") ||
        $("runV9Backtest");

    if (!button) {

        console.error(
            "🔥 V10.1 BACKTEST BUTTON NOT FOUND"
        );

        return;
    }

    button.onclick = null;

    button.onclick =
        runV10Backtest;

    console.log(
        "🔥 BACKTEST CLICK HANDLER ATTACHED"
    );
}

// ======================================================
// PAPER TRADE BUTTON
// ======================================================

function setupPaperTradeButton() {

    const button =
        $("paperTradeBtn");

    if (!button) return;

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

    if (!dot) return;

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
// CLOCK
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
// DATA SOURCE COMPARISON
// DHAN vs INDSTOCKS
// ======================================================

function normalizeCandleTimestamp(ts) {

    const number =
        Number(ts);

    if (!Number.isFinite(number)) {
        return null;
    }

    // Milliseconds → seconds
    if (number > 100000000000) {
        return Math.floor(
            number / 1000
        );
    }

    return number;
}

function normalizeCandles(data) {

    if (!data) {
        return [];
    }

    if (Array.isArray(data.candles)) {
        return data.candles;
    }

    if (
        data.data &&
        Array.isArray(
            data.data.candles
        )
    ) {
        return data.data.candles;
    }

    if (Array.isArray(data.data)) {
        return data.data;
    }

    return [];
}

function normalizeOneCandle(row) {

    if (!row) {
        return null;
    }

    if (Array.isArray(row)) {

        return {

            ts:
                normalizeCandleTimestamp(
                    row[0]
                ),

            o:
                Number(row[1]),

            h:
                Number(row[2]),

            l:
                Number(row[3]),

            c:
                Number(row[4]),

            v:
                Number(row[5])

        };
    }

    return {

        ts:
            normalizeCandleTimestamp(
                row.ts ??
                row.timestamp ??
                row.time
            ),

        o:
            Number(
                row.o ??
                row.open
            ),

        h:
            Number(
                row.h ??
                row.high
            ),

        l:
            Number(
                row.l ??
                row.low
            ),

        c:
            Number(
                row.c ??
                row.close
            ),

        v:
            Number(
                row.v ??
                row.volume
            )
    };
}

function normalizeCandleList(data) {

    return normalizeCandles(data)

        .map(
            normalizeOneCandle
        )

        .filter(
            candle =>
                candle &&
                Number.isFinite(candle.ts) &&
                Number.isFinite(candle.o) &&
                Number.isFinite(candle.h) &&
                Number.isFinite(candle.l) &&
                Number.isFinite(candle.c)
        )

        .sort(
            (a, b) =>
                a.ts - b.ts
        );
}

function candleTimeKey(ts) {

    return Math.floor(
        ts / 300
    ) * 300;
}

function formatComparisonTime(ts) {

    return new Date(
        ts * 1000
    ).toLocaleTimeString(
        "en-IN",
        {
            timeZone:
                "Asia/Kolkata",

            hour:
                "2-digit",

            minute:
                "2-digit"
        }
    );
}

function createComparisonPanel() {

    let panel =
        document.getElementById(
            "dataComparisonPanel"
        );

    if (panel) {
        return panel;
    }

    panel =
        document.createElement(
            "div"
        );

    panel.id =
        "dataComparisonPanel";

    panel.style.margin =
        "20px 0";

    panel.style.padding =
        "20px";

    panel.style.border =
        "1px solid #334155";

    panel.style.borderRadius =
        "16px";

    panel.style.background =
        "#0f172a";

    panel.style.color =
        "#e2e8f0";

    panel.innerHTML = `

        <div style="
            font-size:20px;
            font-weight:700;
            margin-bottom:15px;
        ">
            Dhan vs INDstocks
        </div>

        <div id="comparisonStatus">
            Comparing data sources...
        </div>

        <div id="comparisonResults"
             style="margin-top:12px;">
        </div>
    `;

    document.body.prepend(
        panel
    );

    return panel;
}

async function runDataComparison() {

    console.log(
        "================================"
    );

    console.log(
        "🔥 DHAN vs INDSTOCKS COMPARISON"
    );

    console.log(
        "================================"
    );

    createComparisonPanel();

    const status =
        document.getElementById(
            "comparisonStatus"
        );

    const results =
        document.getElementById(
            "comparisonResults"
        );

    status.textContent =
        "Fetching Dhan + INDstocks candles...";

    results.innerHTML =
        "";

    try {

        const [
            indstocks,
            dhan
        ] = await Promise.all([

            apiFetch(
                `/api/candles?interval=5minute&_compare=${Date.now()}`,
                20000
            ),

            apiFetch(
                `/api/dhan/candles?_compare=${Date.now()}`,
                20000
            )

        ]);

        console.log(
            "INDstocks raw:",
            indstocks
        );

        console.log(
            "Dhan raw:",
            dhan
        );

        const indCandles =
            normalizeCandleList(
                indstocks
            );

        const dhanCandles =
            normalizeCandleList(
                dhan
            );

        console.log(
            "INDstocks normalized:",
            indCandles.length
        );

        console.log(
            "Dhan normalized:",
            dhanCandles.length
        );

        const indMap =
            new Map();

        indCandles.forEach(
            candle => {

                indMap.set(
                    candleTimeKey(
                        candle.ts
                    ),
                    candle
                );
            }
        );

        const dhanMap =
            new Map();

        dhanCandles.forEach(
            candle => {

                dhanMap.set(
                    candleTimeKey(
                        candle.ts
                    ),
                    candle
                );
            }
        );

        const matches = [];

        for (
            const [
                key,
                dhanCandle
            ] of dhanMap
        ) {

            const indCandle =
                indMap.get(key);

            if (!indCandle) {
                continue;
            }

            matches.push({

                ts: key,

                time:
                    formatComparisonTime(
                        key
                    ),

                dhanOpen:
                    dhanCandle.o,

                indstocksOpen:
                    indCandle.o,

                openDiff:
                    Number(
                        (
                            dhanCandle.o -
                            indCandle.o
                        ).toFixed(2)
                    ),

                dhanHigh:
                    dhanCandle.h,

                indstocksHigh:
                    indCandle.h,

                highDiff:
                    Number(
                        (
                            dhanCandle.h -
                            indCandle.h
                        ).toFixed(2)
                    ),

                dhanLow:
                    dhanCandle.l,

                indstocksLow:
                    indCandle.l,

                lowDiff:
                    Number(
                        (
                            dhanCandle.l -
                            indCandle.l
                        ).toFixed(2)
                    ),

                dhanClose:
                    dhanCandle.c,

                indstocksClose:
                    indCandle.c,

                closeDiff:
                    Number(
                        (
                            dhanCandle.c -
                            indCandle.c
                        ).toFixed(2)
                    ),

                volumeDiff:
                    Number(
                        (
                            dhanCandle.v -
                            indCandle.v
                        ).toFixed(0)
                    )
            });
        }

        let totalCloseDifference = 0;

        let maxCloseDifference = 0;

        let exactCloseMatches = 0;

        matches.forEach(
            row => {

                const difference =
                    Math.abs(
                        row.closeDiff
                    );

                totalCloseDifference +=
                    difference;

                maxCloseDifference =
                    Math.max(
                        maxCloseDifference,
                        difference
                    );

                if (
                    difference === 0
                ) {

                    exactCloseMatches++;
                }
            }
        );

        const averageCloseDifference =
            matches.length
                ? totalCloseDifference /
                  matches.length
                : 0;

        const exactMatchRate =
            matches.length
                ? (
                    exactCloseMatches /
                    matches.length
                ) * 100
                : 0;

        status.innerHTML =
            "Comparison complete ✅";

        results.innerHTML = `

            <div style="
                display:grid;
                grid-template-columns:
                    repeat(2,minmax(0,1fr));
                gap:14px;
            ">

                <div>
                    <strong>
                        Dhan candles
                    </strong>
                    <br>
                    ${dhanCandles.length}
                </div>

                <div>
                    <strong>
                        INDstocks candles
                    </strong>
                    <br>
                    ${indCandles.length}
                </div>

                <div>
                    <strong>
                        Matching candles
                    </strong>
                    <br>
                    ${matches.length}
                </div>

                <div>
                    <strong>
                        Exact close matches
                    </strong>
                    <br>
                    ${exactMatchRate.toFixed(2)}%
                </div>

                <div>
                    <strong>
                        Avg close difference
                    </strong>
                    <br>
                    ${averageCloseDifference.toFixed(2)}
                </div>

                <div>
                    <strong>
                        Max close difference
                    </strong>
                    <br>
                    ${maxCloseDifference.toFixed(2)}
                </div>

            </div>
        `;

        console.log(
            "🔥 COMPARISON SUMMARY"
        );

        console.log({

            dhanCandles:
                dhanCandles.length,

            indstocksCandles:
                indCandles.length,

            matchingCandles:
                matches.length,

            exactCloseMatches:
                exactCloseMatches,

            exactMatchRate:
                exactMatchRate.toFixed(2) + "%",

            averageCloseDifference:
                averageCloseDifference.toFixed(2),

            maxCloseDifference:
                maxCloseDifference.toFixed(2)
        });

        console.table(
            matches.slice(
                0,
                20
            )
        );

        console.log(
            "🔥 First 5 matches:",
            matches.slice(
                0,
                5
            )
        );

        console.log(
            "🔥 Last 5 matches:",
            matches.slice(
                -5
            )
        );

    }

    catch (error) {

        console.error(
            "🔥 DATA COMPARISON ERROR:",
            error
        );

        status.textContent =
            "Comparison failed ❌";

        results.innerHTML = `

            <div style="
                color:#f87171;
                margin-top:10px;
            ">
                ${error.message}
            </div>
        `;
    }
}
// ======================================================
// DHAN vs INDSTOCKS DATA COMPARISON
// ======================================================

async function compareDhanVsINDstocks() {

    console.log(
        "================================"
    );

    console.log(
        "🔥 DHAN vs INDSTOCKS COMPARISON START"
    );

    console.log(
        "================================"
    );


    const statusElement =
        $("comparisonStatus");

    const detailsElement =
        $("comparisonDetails");


    if (statusElement) {
        statusElement.textContent =
            "Comparing market data...";
    }


    if (detailsElement) {
        detailsElement.textContent =
            "Fetching Dhan and INDstocks candles...";
    }


    try {

        // ----------------------------------------------
        // Fetch both sources at the same time
        // ----------------------------------------------

        const cacheBust =
            Date.now();


        const [dhanResult, indResult] =
            await Promise.all([

                apiFetch(
                    `/api/dhan/candles?_t=${cacheBust}`,
                    20000
                ),

                apiFetch(
                    `/api/candles?interval=5minute&_t=${cacheBust}`,
                    20000
                )

            ]);


        console.log(
            "🔥 Dhan comparison data:",
            dhanResult
        );


        console.log(
            "🔥 INDstocks comparison data:",
            indResult
        );


        // ----------------------------------------------
        // Dhan candles
        // ----------------------------------------------

        const dhanCandles =
            Array.isArray(dhanResult?.candles)
                ? dhanResult.candles
                : [];


        if (!dhanCandles.length) {

            throw new Error(
                "Dhan returned no NIFTY candles"
            );

        }


        // ----------------------------------------------
        // Extract INDstocks NIFTY candles
        // ----------------------------------------------

        const indData =
            indResult?.data;


        let indCandles = [];


        /*
        INDstocks responses have appeared in slightly
        different structures during development.

        Try to locate NIFTY safely.
        */

        if (Array.isArray(indData)) {

            const niftyBlock =
                indData.find(item => {

                    const text =
                        JSON.stringify(item)
                            .toLowerCase();

                    return (
                        text.includes("40000001") ||
                        text.includes("nidx_40000001")
                    );

                });


            if (niftyBlock) {

                indCandles =
                    niftyBlock.candles ||
                    niftyBlock.data ||
                    niftyBlock.values ||
                    [];

            }

        }

        else if (
            indData &&
            typeof indData === "object"
        ) {

            const possibleKeys =
                Object.keys(indData);


            const niftyKey =
                possibleKeys.find(key => {

                    const lower =
                        key.toLowerCase();

                    return (
                        lower.includes("40000001") ||
                        lower.includes("nidx_40000001") ||
                        lower === "nifty" ||
                        lower === "nifty50"
                    );

                });


            if (niftyKey) {

                const niftyBlock =
                    indData[niftyKey];


                indCandles =
                    Array.isArray(niftyBlock)
                        ? niftyBlock
                        : niftyBlock?.candles ||
                          niftyBlock?.data ||
                          niftyBlock?.values ||
                          [];

            }

        }


        console.log(
            "🔥 Dhan candles:",
            dhanCandles.length
        );


        console.log(
            "🔥 INDstocks NIFTY candles:",
            indCandles.length
        );


        if (!indCandles.length) {

            throw new Error(
                "Could not locate NIFTY candles in INDstocks response"
            );

        }


        // ----------------------------------------------
        // Normalize candles
        // ----------------------------------------------

        function normalizeCandle(candle) {

            if (!candle) {
                return null;
            }


            const ts =
                Number(
                    candle.ts ??
                    candle.timestamp ??
                    candle.time
                );


            const open =
                Number(
                    candle.o ??
                    candle.open
                );


            const high =
                Number(
                    candle.h ??
                    candle.high
                );


            const low =
                Number(
                    candle.l ??
                    candle.low
                );


            const close =
                Number(
                    candle.c ??
                    candle.close
                );


            if (
                !Number.isFinite(ts) ||
                !Number.isFinite(close)
            ) {

                return null;

            }


            /*
            Convert millisecond timestamps to seconds
            when necessary.
            */

            const timestamp =
                ts > 100000000000
                    ? Math.floor(ts / 1000)
                    : Math.floor(ts);


            return {

                ts:
                    timestamp,

                o:
                    open,

                h:
                    high,

                l:
                    low,

                c:
                    close

            };

        }


        const normalizedDhan =
            dhanCandles
                .map(normalizeCandle)
                .filter(Boolean);


        const normalizedIND =
            indCandles
                .map(normalizeCandle)
                .filter(Boolean);


        // ----------------------------------------------
        // Create INDstocks timestamp lookup
        // ----------------------------------------------

        const indMap =
            new Map();


        normalizedIND.forEach(candle => {

            indMap.set(
                candle.ts,
                candle
            );

        });


        // ----------------------------------------------
        // Compare matching timestamps
        // ----------------------------------------------

        const matches = [];


        normalizedDhan.forEach(dhanCandle => {

            const indCandle =
                indMap.get(
                    dhanCandle.ts
                );


            if (!indCandle) {
                return;
            }


            const closeDifference =
                Math.abs(
                    dhanCandle.c -
                    indCandle.c
                );


            matches.push({

                ts:
                    dhanCandle.ts,

                dhanClose:
                    dhanCandle.c,

                indClose:
                    indCandle.c,

                difference:
                    closeDifference

            });

        });


        console.log(
            "🔥 Matching candles:",
            matches.length
        );


        console.table(
            matches.slice(-20)
        );


        // ----------------------------------------------
        // No exact timestamp matches
        // ----------------------------------------------

        if (!matches.length) {

            if (statusElement) {

                statusElement.textContent =
                    "Comparison needs timestamp alignment ⚠️";

            }


            if (detailsElement) {

                detailsElement.textContent =
                    `Dhan: ${normalizedDhan.length} candles | ` +
                    `INDstocks: ${normalizedIND.length} candles | ` +
                    `Exact timestamp matches: 0`;

            }


            console.warn(
                "🔥 No exact timestamps matched."
            );


            console.log(
                "Dhan sample:",
                normalizedDhan.slice(0, 5)
            );


            console.log(
                "INDstocks sample:",
                normalizedIND.slice(0, 5)
            );


            return;

        }


        // ----------------------------------------------
        // Statistics
        // ----------------------------------------------

        const averageDifference =
            matches.reduce(
                (sum, candle) =>
                    sum + candle.difference,
                0
            ) /
            matches.length;


        const maxDifference =
            Math.max(
                ...matches.map(
                    candle =>
                        candle.difference
                )
            );


        const lastMatch =
            matches[
                matches.length - 1
            ];


        // ----------------------------------------------
        // Determine quality
        // ----------------------------------------------

        let quality;


        if (averageDifference <= 1) {

            quality =
                "EXCELLENT";

        }

        else if (averageDifference <= 3) {

            quality =
                "GOOD";

        }

        else if (averageDifference <= 10) {

            quality =
                "ACCEPTABLE";

        }

        else {

            quality =
                "DATA MISMATCH";

        }


        // ----------------------------------------------
        // Dashboard
        // ----------------------------------------------

        if (statusElement) {

            statusElement.textContent =
                `Comparison successful ✅ — ${quality}`;

        }


        if (detailsElement) {

            detailsElement.textContent =

                `Matched: ${matches.length} candles | ` +

                `Dhan: ${normalizedDhan.length} | ` +

                `INDstocks: ${normalizedIND.length} | ` +

                `Avg close difference: ${averageDifference.toFixed(2)} pts | ` +

                `Max difference: ${maxDifference.toFixed(2)} pts | ` +

                `Latest Dhan: ${lastMatch.dhanClose.toFixed(2)} | ` +

                `Latest INDstocks: ${lastMatch.indClose.toFixed(2)}`;

        }


        console.log(
            "================================"
        );


        console.log(
            "🔥 DHAN vs INDSTOCKS RESULT"
        );


        console.log({

            quality,

            dhanCandles:
                normalizedDhan.length,

            indCandles:
                normalizedIND.length,

            matchedCandles:
                matches.length,

            averageDifference,

            maxDifference,

            latest:
                lastMatch

        });


        console.log(
            "================================"
        );

    }

    catch (error) {

        console.error(
            "🔥 Dhan vs INDstocks comparison error:",
            error
        );


        if (statusElement) {

            statusElement.textContent =
                "Comparison failed ❌";

        }


        if (detailsElement) {

            detailsElement.textContent =
                error?.message ||
                "Unknown comparison error";

        }

    }

}
// ======================================================
// INITIALIZE
// ======================================================

async function initialize() {

    console.log(
        "================================"
    );

    console.log(
        "🔥 TradeMind Pro V10.1 STARTED"
    );

    console.log(
        "🔥 Frontend controller loaded"
    );

    console.log(
        "🔥 Paper Trading Only"
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

    setBacktestField(
        "status",
        "Waiting for historical data"
    );

    setBacktestField(
        "engine",
        "V10.1 Historical Simulation"
    );

    setupPaperTradeButton();

    setupBacktestButton();

    // Load indicators
    await fetchIndicatorData();

    // Load live market data
await fetchMarketData();

updateTime();

/*
Compare today's NIFTY 5-minute candles
from Dhan and INDstocks.

Comparison only.
No orders.
*/
await compareDhanVsINDstocks();

console.log(
    "🔥 INITIALIZATION COMPLETE"
);
}

// ======================================================
// REFRESH TIMERS
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

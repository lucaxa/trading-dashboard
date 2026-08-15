/*
===========================================================
 TradeMind Pro
 V10.25 Frontend Controller
 ----------------------------------------------------------
 Purpose:
 - Connect the V10.25 frontend to the existing backend APIs
 - Keep all trading activity PAPER ONLY
 - Display live INDstocks data
 - Display technical indicators
 - Run the V10.25 historical backtest
 - Render the V10.25 result without reverting to V10.1
 ----------------------------------------------------------
 IMPORTANT:
 - No real orders
 - No broker execution
 - No strategy learning/modification
 - Backend remains the source of truth
===========================================================
*/

"use strict";

console.log("🔥 TradeMind Pro V10.25 frontend controller loaded");
console.log("🔥 PAPER TRADING ONLY");
console.log("🔥 V10.25 BACKTEST CONTROLLER ACTIVE");

const state = {
    nifty: null,
    banknifty: null,
    indicators: null,
    backtest: null,
    connected: false,
    backtestRunning: false,
    lastUpdate: null
};

/* =========================================================
   DOM HELPERS
========================================================= */

function $(id) {
    return document.getElementById(id);
}

function setText(id, value) {
    const el = $(id);
    if (el) el.textContent = value;
}

function setAny(ids, value) {
    for (const id of ids) {
        const el = $(id);
        if (el) {
            el.textContent = value;
            return true;
        }
    }
    return false;
}

/* =========================================================
   FORMATTING
========================================================= */

function numberOrNull(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

function formatPrice(value) {
    const n = numberOrNull(value);
    if (n === null) return "--";

    return n.toLocaleString("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function formatNumber(value) {
    const n = numberOrNull(value);
    if (n === null) return "--";
    return n.toFixed(2);
}

function formatPercent(value) {
    const n = numberOrNull(value);
    if (n === null) return "--";
    return `${n.toFixed(2)}%`;
}

function safeStatistic(value) {
    if (value === null || value === undefined || value === "") {
        return null;
    }

    const n = Number(value);
    return Number.isFinite(n) ? n : value;
}

/* =========================================================
   API
========================================================= */

async function apiFetch(url, timeoutMs = 15000) {
    console.log("TradeMind API REQUEST:", url);

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

        let data;

        try {
            data = JSON.parse(text);
        } catch {
            throw new Error(
                `Invalid JSON response from ${url} (HTTP ${response.status})`
            );
        }

        console.log("TradeMind API response:", data);

        if (!response.ok) {
            const message =
                typeof data?.error === "string"
                    ? data.error
                    : JSON.stringify(data?.error || data);

            throw new Error(
                message || `API HTTP error ${response.status}`
            );
        }

        if (data && data.success === false) {
            const message =
                typeof data.error === "string"
                    ? data.error
                    : JSON.stringify(data.error || data);

            throw new Error(
                message || "API returned success:false"
            );
        }

        return data;

    } catch (error) {

        if (error?.name === "AbortError") {
            throw new Error(
                `API request timed out after ${timeoutMs / 1000} seconds`
            );
        }

        throw error;

    } finally {
        clearTimeout(timeout);
    }
}

/* =========================================================
   QUOTE EXTRACTION
========================================================= */

function extractQuotes(data) {
    if (Array.isArray(data)) return data;

    if (!data || typeof data !== "object") {
        return [];
    }

    if (Array.isArray(data.data)) return data.data;
    if (Array.isArray(data.quotes)) return data.quotes;
    if (Array.isArray(data.results)) return data.results;
    if (Array.isArray(data.items)) return data.items;

    return Object.values(data).filter(
        value =>
            value &&
            typeof value === "object" &&
            !Array.isArray(value)
    );
}

function extractPrice(quote) {
    if (typeof quote === "number") return quote;

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
        const n = Number(quote[field]);

        if (Number.isFinite(n) && n > 0) {
            return n;
        }
    }

    return null;
}

function findInstrument(quotes, instrument) {
    const wanted = String(instrument).toLowerCase();

    return quotes.find(quote => {
        if (!quote || typeof quote !== "object") {
            return false;
        }

        const text =
            JSON.stringify(quote).toLowerCase();

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

/* =========================================================
   MARKET DATA
========================================================= */

async function fetchMarketData() {
    try {
        const result = await apiFetch(
            "/api/quotes",
            10000
        );

        const quotes = extractQuotes(
            result?.data ?? result
        );

        const niftyQuote =
            findInstrument(quotes, "nifty");

        const bankQuote =
            findInstrument(quotes, "banknifty");

        const niftyPrice =
            extractPrice(niftyQuote);

        const bankPrice =
            extractPrice(bankQuote);

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
        state.lastUpdate = new Date();

        setText("marketStatus", "LIVE");
        setText("dataStatus", "INDSTOCKS");

        updateStatusDot(true);
        updateTime();
        updateBankTrend();

    } catch (error) {
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

function renderMarket() {
    if (state.nifty) {
        setText(
            "niftyPrice",
            formatPrice(state.nifty.price)
        );

        renderChange(
            "niftyChange",
            state.nifty.price,
            state.nifty.previous
        );

        updateNiftyTrend();
    }

    if (state.banknifty) {
        setText(
            "bankPrice",
            formatPrice(state.banknifty.price)
        );

        renderChange(
            "bankChange",
            state.banknifty.price,
            state.banknifty.previous
        );
    }
}

function renderChange(id, current, previous) {
    const el = $(id);

    if (!el) return;

    if (
        !Number.isFinite(current) ||
        !Number.isFinite(previous)
    ) {
        el.textContent = "Waiting for data";
        el.className = "change";
        return;
    }

    const difference =
        current - previous;

    if (difference === 0) {
        el.textContent = "No change";
        el.className = "change";
        return;
    }

    const percent =
        previous !== 0
            ? (difference / previous) * 100
            : 0;

    const direction =
        difference > 0 ? "▲" : "▼";

    el.textContent =
        `${direction} ${Math.abs(difference).toFixed(2)} (${Math.abs(percent).toFixed(2)}%)`;

    el.className =
        difference > 0
            ? "change up"
            : "change down";
}

function updateNiftyTrend() {
    const n = state.nifty?.price;
    const i = state.indicators?.nifty;

    if (!Number.isFinite(n) || !i) {
        setText("niftyTrend", "--");
        return;
    }

    const ema9 = Number(i.ema9);
    const ema21 = Number(i.ema21);

    if (
        Number.isFinite(ema9) &&
        Number.isFinite(ema21)
    ) {
        setText(
            "niftyTrend",
            ema9 > ema21
                ? "BULLISH"
                : ema9 < ema21
                    ? "BEARISH"
                    : "NEUTRAL"
        );
    }
}

function updateBankTrend() {
    const price = state.banknifty?.price;
    const bank = state.indicators?.banknifty;

    if (
        !Number.isFinite(price) ||
        !bank
    ) {
        setText("bankTrend", "--");
        return;
    }

    const ema9 = Number(bank.ema9);
    const ema21 = Number(bank.ema21);

    if (
        Number.isFinite(ema9) &&
        Number.isFinite(ema21)
    ) {
        setText(
            "bankTrend",
            ema9 > ema21
                ? "BULLISH"
                : ema9 < ema21
                    ? "BEARISH"
                    : "NEUTRAL"
        );
    }
}

/* =========================================================
   INDICATORS
========================================================= */

async function fetchIndicatorData() {
    try {
        setText(
            "analysisStatus",
            "CALCULATING"
        );

        const result = await apiFetch(
            "/api/indicators?interval=5minute",
            15000
        );

        state.indicators = result;

        console.log(
            "TradeMind V10.25 indicators:",
            result
        );

        const nifty =
            result?.nifty || {};

        const bank =
            result?.banknifty || {};

        const niftyClose =
            Number(nifty.lastCandle?.c);

        if (
            !Number.isFinite(
                state.nifty?.price
            ) &&
            Number.isFinite(niftyClose)
        ) {
            state.nifty = {
                price: niftyClose,
                previous: niftyClose
            };
        }

        const bankClose =
            Number(bank.lastCandle?.c);

        if (
            !Number.isFinite(
                state.banknifty?.price
            ) &&
            Number.isFinite(bankClose)
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

        setText(
            "analysisStatus",
            "LIVE"
        );

    } catch (error) {
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

function renderIndicators() {
    const nifty =
        state.indicators?.nifty;

    if (!nifty) return;

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

    setText(
        "diagPrice",
        formatPrice(
            nifty.lastCandle?.c ??
            state.nifty?.price
        )
    );
}

/* =========================================================
   MARKET ANALYSIS
========================================================= */

function analyzeMarket() {
    const nifty =
        state.indicators?.nifty;

    if (!nifty) {
        setText("trend", "--");
        setText("momentum", "--");
        setText("volatility", "--");
        setText("signal", "WAIT");

        return;
    }

    const price =
        Number(
            nifty.lastCandle?.c ??
            state.nifty?.price
        );

    const ema9 =
        Number(nifty.ema9);

    const ema21 =
        Number(nifty.ema21);

    const rsi =
        Number(nifty.rsi14);

    const vwap =
        Number(nifty.vwap);

    const trend =
        ema9 > ema21
            ? "BULLISH"
            : ema9 < ema21
                ? "BEARISH"
                : "NEUTRAL";

    const momentum =
        Number.isFinite(rsi)
            ? (
                rsi >= 50
                    ? `POSITIVE (${rsi.toFixed(1)})`
                    : `NEGATIVE (${rsi.toFixed(1)})`
            )
            : "--";

    const volatility =
        Number.isFinite(price) &&
        Number.isFinite(vwap)
            ? (
                price >= vwap
                    ? "ABOVE VWAP"
                    : "BELOW VWAP"
            )
            : "--";

    let signal = "WAIT";

    if (
        trend === "BULLISH" &&
        Number.isFinite(rsi) &&
        rsi >= 53 &&
        Number.isFinite(price) &&
        Number.isFinite(vwap) &&
        price > vwap
    ) {
        signal = "BUY";
    }

    if (
        trend === "BEARISH" &&
        Number.isFinite(rsi) &&
        rsi <= 48 &&
        Number.isFinite(price) &&
        Number.isFinite(vwap) &&
        price < vwap
    ) {
        signal = "SELL";
    }

    setText("trend", trend);
    setText("momentum", momentum);
    setText("volatility", volatility);
    setText("signal", signal);

    renderTradeSetup(
        signal,
        price,
        Number(nifty.atr14)
    );
}

function renderTradeSetup(
    signal,
    price,
    atrValue
) {
    if (
        !Number.isFinite(price) ||
        !Number.isFinite(atrValue) ||
        signal === "WAIT"
    ) {
        setText("entry", "--");
        setText("stoploss", "--");
        setText("target", "--");
        setText("riskReward", "--");

        return;
    }

    const risk =
        atrValue * 1.5;

    const reward =
        risk * 2;

    const stop =
        signal === "BUY"
            ? price - risk
            : price + risk;

    const target =
        signal === "BUY"
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
        "1:2"
    );
}

/* =========================================================
   V10 DIAGNOSTICS
========================================================= */

function renderV10Diagnostics() {
    const nifty =
        state.indicators?.nifty;

    if (!nifty) return;

    const ema9 =
        Number(nifty.ema9);

    const ema21 =
        Number(nifty.ema21);

    const rsi =
        Number(nifty.rsi14);

    const price =
        Number(
            nifty.lastCandle?.c ??
            state.nifty?.price
        );

    const vwap =
        Number(nifty.vwap);

    let buyScore = 0;
    let sellScore = 0;

    if (
        Number.isFinite(ema9) &&
        Number.isFinite(ema21)
    ) {
        if (ema9 > ema21) buyScore++;
        if (ema9 < ema21) sellScore++;
    }

    if (Number.isFinite(rsi)) {
        if (rsi >= 53) buyScore++;
        if (rsi <= 48) sellScore++;
    }

    if (
        Number.isFinite(price) &&
        Number.isFinite(vwap)
    ) {
        if (price > vwap) buyScore++;
        if (price < vwap) sellScore++;
    }

    const maxScore = 3;

    const confidence =
        Math.round(
            (
                Math.max(
                    buyScore,
                    sellScore
                ) / maxScore
            ) * 100
        );

    setText(
        "buyScore",
        String(buyScore)
    );

    setText(
        "sellScore",
        String(sellScore)
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

    const signal =
        $("signal")?.textContent ||
        "WAIT";

    if (signal === "BUY") {
        setText(
            "signalReason",
            "Bullish confirmation present"
        );

        setText(
            "strategyStatus",
            "BUY CONFIRMATION"
        );
    } else if (signal === "SELL") {
        setText(
            "signalReason",
            "Bearish confirmation present"
        );

        setText(
            "strategyStatus",
            "SELL CONFIRMATION"
        );
    } else {
        setText(
            "signalReason",
            "Waiting for stronger confirmation"
        );

        setText(
            "strategyStatus",
            "WAITING FOR CONFIRMATION"
        );
    }
}

/* =========================================================
   BACKTEST DISPLAY
========================================================= */

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

    for (const id of fields) {
        setText(id, "--");
    }

    setText(
        "backtestStatus",
        "Preparing V10.25 historical simulation..."
    );

    setText(
        "backtestEngine",
        "V10.25 Historical Simulation — RUNNING"
    );

    const history =
        $("tradeHistory");

    if (history) {
        history.innerHTML =
            `<div class="trade-history-empty">
                Running V10.25 historical backtest...
            </div>`;
    }
}

function setBacktestButtonRunning(running) {
    const button =
        $("runBacktestBtn");

    if (!button) return;

    button.disabled = running;

    button.textContent =
        running
            ? "RUNNING V10.25 BACKTEST..."
            : "RUN V10.25 BACKTEST";
}

/* =========================================================
   V10.25 BACKTEST
========================================================= */

async function runV1025Backtest() {
    if (state.backtestRunning) {
        return;
    }

    console.log(
        "🔥 V10.25 BACKTEST BUTTON CLICKED"
    );

    state.backtestRunning = true;

    setBacktestButtonRunning(true);
    resetBacktestDisplay();

    try {
        setText(
            "backtestStatus",
            "Calling V10.25 historical backtest API..."
        );

        const cacheBust =
            Date.now();

        const result =
            await apiFetch(
                `/api/backtest?interval=5minute&_t=${cacheBust}`,
                30000
            );

        console.log(
            "🔥 V10.25 BACKTEST RESULT:",
            result
        );

        state.backtest = result;

        renderBacktestResult(result);

    } catch (error) {
        console.error(
            "🔥 V10.25 BACKTEST ERROR:",
            error
        );

        setText(
            "backtestStatus",
            `V10.25 BACKTEST ERROR — ${error.message}`
        );

        setText(
            "backtestEngine",
            "V10.25 Historical Simulation — ERROR"
        );

    } finally {
        state.backtestRunning = false;
        setBacktestButtonRunning(false);
    }
}

function renderBacktestResult(result) {
    if (!result || typeof result !== "object") {
        throw new Error(
            "Backtest returned an invalid result"
        );
    }

    const version =
        result.version ||
        "V10.25";

    const candles =
        safeStatistic(
            result.candlesTested
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

    const winningTrades =
        safeStatistic(
            result.winningTrades
        );

    const losingTrades =
        safeStatistic(
            result.losingTrades
        );

    setText(
        "candlesTested",
        candles ?? "--"
    );

    setText(
        "totalTrades",
        totalTrades ?? "--"
    );

    setText(
        "buyTrades",
        buyTrades ?? "--"
    );

    setText(
        "sellTrades",
        sellTrades ?? "--"
    );

    setText(
        "winningTrades",
        winningTrades ?? "--"
    );

    setText(
        "losingTrades",
        losingTrades ?? "--"
    );

    const winRate =
        safeStatistic(
            result.winRate
        );

    setText(
        "winRate",
        winRate === null
            ? "--"
            : (
                typeof winRate === "number"
                    ? formatPercent(winRate)
                    : winRate
            )
    );

    const totalPoints =
        safeStatistic(
            result.totalPoints
        );

    const averageWin =
        safeStatistic(
            result.averageWin
        );

    const averageLoss =
        safeStatistic(
            result.averageLoss
        );

    const profitFactor =
        safeStatistic(
            result.profitFactor
        );

    const maxDrawdown =
        safeStatistic(
            result.maxDrawdown
        );

    setText(
        "totalPoints",
        totalPoints ?? "--"
    );

    setText(
        "averageWin",
        averageWin ?? "--"
    );

    setText(
        "averageLoss",
        averageLoss ?? "--"
    );

    setText(
        "profitFactor",
        profitFactor ?? "--"
    );

    setText(
        "maxDrawdown",
        maxDrawdown ?? "--"
    );

    setText(
        "backtestStatus",
        `V10.25 BACKTEST COMPLETE — ${totalTrades ?? 0} trades simulated`
    );

    setText(
        "backtestEngine",
        `${version} Historical Simulation`
    );

    if (
        Array.isArray(result.trades)
    ) {
        renderTradeHistory(
            result.trades
        );
    } else {
        renderTradeHistory([]);
    }
}

/* =========================================================
   TRADE HISTORY
========================================================= */

function renderTradeHistory(trades) {
    const container =
        $("tradeHistory");

    if (!container) return;

    if (
        !Array.isArray(trades) ||
        trades.length === 0
    ) {
        container.innerHTML =
            `<div class="trade-history-empty">
                No V10.25 backtest trades returned.
            </div>`;

        return;
    }

    container.innerHTML = "";

    trades.forEach(
        (trade, index) => {
            const row =
                document.createElement("div");

            row.className =
                "trade-history-row";

            const side =
                String(
                    trade.side ??
                    trade.type ??
                    trade.action ??
                    "--"
                ).toUpperCase();

            const entry =
                trade.entry ??
                trade.entryPrice ??
                trade.entry_price;

            const exit =
                trade.exit ??
                trade.exitPrice ??
                trade.exit_price;

            const points =
                trade.points ??
                trade.pnl ??
                trade.profit ??
                trade.result;

            const outcome =
                trade.outcome ??
                trade.status ??
                (
                    Number(points) > 0
                        ? "WIN"
                        : Number(points) < 0
                            ? "LOSS"
                            : "--"
                );

            const reason =
                trade.exitReason ??
                trade.reason ??
                trade.exit_reason ??
                "--";

            row.innerHTML = `
                <span>#${index + 1}</span>
                <span>${escapeHtml(side)}</span>
                <span>Entry: ${escapeHtml(formatPrice(entry))}</span>
                <span>Exit: ${escapeHtml(formatPrice(exit))}</span>
                <span>Points: ${escapeHtml(formatNumber(points))}</span>
                <span>Outcome: ${escapeHtml(String(outcome))}</span>
                <span>${escapeHtml(String(reason))}</span>
                <span>${escapeHtml(String(trade.timestamp ?? trade.ts ?? ""))}</span>
                <span>V10.25</span>
            `;

            container.appendChild(row);
        }
    );
}

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

/* =========================================================
   PAPER TRADE
========================================================= */

function handlePaperTrade() {
    const signal =
        $("signal")?.textContent ||
        "WAIT";

    if (
        signal !== "BUY" &&
        signal !== "SELL"
    ) {
        setText(
            "strategyStatus",
            "PAPER TRADE BLOCKED — WAITING FOR CONFIRMATION"
        );

        setText(
            "signalReason",
            "No confirmed BUY/SELL signal"
        );

        return;
    }

    console.log(
        "PAPER TRADE ONLY:",
        signal
    );

    setText(
        "strategyStatus",
        `PAPER ${signal} SIGNAL — NO REAL ORDER`
    );

    setText(
        "signalReason",
        `Paper ${signal} action recorded locally; broker execution remains disabled`
    );
}

/* =========================================================
   STATUS
========================================================= */

function updateStatusDot(live) {
    const dot =
        $("statusDot");

    if (!dot) return;

    if (live) {
        dot.classList.remove("closed");
    } else {
        dot.classList.add("closed");
    }
}

function updateTime() {
    const el =
        $("lastUpdate");

    if (!el) return;

    const date =
        state.lastUpdate ||
        new Date();

    el.textContent =
        date.toLocaleTimeString(
            "en-IN",
            {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit"
            }
        );
}

/* =========================================================
   INITIALIZATION
========================================================= */

function attachEvents() {
    const backtestButton =
        $("runBacktestBtn");

    if (backtestButton) {
        backtestButton.addEventListener(
            "click",
            runV1025Backtest
        );
    }

    const paperButton =
        $("paperTradeBtn");

    if (paperButton) {
        paperButton.addEventListener(
            "click",
            handlePaperTrade
        );
    }
}

async function initialize() {
    console.log(
        "🔥 TradeMind Pro V10.25 initialization"
    );

    attachEvents();

    setText(
        "backtestEngine",
        "V10.25 Historical Simulation"
    );

    setText(
        "backtestStatus",
        "Waiting for historical data"
    );

    setText(
        "analysisStatus",
        "CONNECTING"
    );

    setText(
        "strategyStatus",
        "WAITING FOR DATA"
    );

    await Promise.allSettled([
        fetchMarketData(),
        fetchIndicatorData()
    ]);

    console.log(
        "🔥 TradeMind Pro V10.25 initialization complete"
    );
}

if (
    document.readyState === "loading"
) {
    document.addEventListener(
        "DOMContentLoaded",
        initialize
    );
} else {
    initialize();
}

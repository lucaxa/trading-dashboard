/*
TradeMind Pro
V3 Real Market Data Engine

CONNECTED TO:
INDstocks API → Vercel → Dashboard

IMPORTANT:
- Real market data
- PAPER TRADING ONLY
- NO LIVE ORDERS
*/

const market = {

  nifty: {
    price: 0,
    previous: 0,
    history: []
  },

  banknifty: {
    price: 0,
    previous: 0,
    history: []
  }

};

const state = {

  signal: "WAIT",

  paperTrades: [],

  lastUpdate: null,

  apiConnected: false

  indicators: null,
  
  indicatorConnected: false,

};


/*
Fetch REAL market data
from our Vercel backend.
*/

async function fetchMarketData() {

  try {

    const response =
      await fetch(
        "/api/quotes",
        {
          cache: "no-store"
        }
      );

    const result =
      await response.json();

    if (!response.ok || !result.success) {

      throw new Error(
        result.error ||
        "Market API failed"
      );

    }

    /*
    INDstocks response structure
    can vary slightly depending
    on the quote response.

    We therefore search the
    returned object safely.
    */

    const quotes =
      extractQuotes(result.data);

    if (!quotes.length) {

      throw new Error(
        "No quote data received"
      );

    }

    /*
    Find NIFTY and BANKNIFTY
    using the security IDs
    configured in the backend.
    */

    const niftyQuote =
      findQuote(
        quotes,
        "nifty"
      );

    const bankQuote =
      findQuote(
        quotes,
        "banknifty"
      );

    if (niftyQuote) {

      updateInstrument(
        market.nifty,
        niftyQuote
      );

    }

    if (bankQuote) {

      updateInstrument(
        market.banknifty,
        bankQuote
      );

    }

    state.apiConnected = true;

    setText(
      "analysisStatus",
      "LIVE"
    );

    renderMarket();

    analyzeMarket();

    updateTime();

  }

  catch (error) {

    console.error(
      "Market data error:",
      error
    );

    state.apiConnected = false;

    setText(
      "analysisStatus",
      "OFFLINE"
    );

    setText(
      "lastUpdate",
      "API ERROR"
    );

  }

}
/*
Fetch REAL technical indicators
from our Vercel backend.
*/

async function fetchIndicatorData() {

  try {

    const response =
      await fetch(
        "/api/indicators?interval=5minute",
        {
          cache: "no-store"
        }
      );

    const result =
      await response.json();

    if (
      !response.ok ||
      !result.success
    ) {

      throw new Error(
        result.error ||
        "Indicator API failed"
      );

    }

    state.indicators =
      result.nifty;

    state.indicatorConnected =
      true;

    analyzeMarket();

    console.log(
      "REAL NIFTY INDICATORS:",
      state.indicators
    );

  }

  catch (error) {

    console.error(
      "Indicator data error:",
      error
    );

    state.indicatorConnected =
      false;

  }

}


/*
Extract possible quote arrays
from INDstocks response.
*/

function extractQuotes(data) {

  if (!data) {
    return [];
  }

  if (Array.isArray(data)) {
    return data;
  }

  if (Array.isArray(data.data)) {
    return data.data;
  }

  if (Array.isArray(data.quotes)) {
    return data.quotes;
  }

  if (Array.isArray(data.result)) {
    return data.result;
  }

  if (typeof data === "object") {

    return Object.entries(data).map(
      ([scripCode, quote]) => ({
        scripCode,
        ...quote
      })
    );

  }

  return [];
}



/*
Find a specific instrument.
*/

function findQuote(
  quotes,
  instrument
) {

  if (!Array.isArray(quotes)) {
    return null;
  }

  /*
  api/quotes.js requests:
  NIFTY first
  BANKNIFTY second
  */

  if (
    instrument === "nifty"
  ) {

    return quotes[0] || null;

  }

  if (
    instrument === "banknifty"
  ) {

    return quotes[1] || null;

  }

  return null;
}


/*
Update one instrument.
*/

function updateInstrument(
  instrument,
  quote
) {

  const newPrice =
    extractPrice(
      quote
    );

  if (
    !Number.isFinite(
      newPrice
    ) ||
    newPrice <= 0
  ) {

    return;

  }

  instrument.previous =
    instrument.price || newPrice;

  instrument.price =
    newPrice;

  instrument.history.push(
    newPrice
  );

  /*
  Keep latest 100 observations.
  */

  if (
    instrument.history.length > 100
  ) {

    instrument.history.shift();

  }

}


/*
Find the price field safely.
*/
function extractPrice(quote) {

  if (
    typeof quote === "number"
  ) {
    return quote;
  }

  if (!quote) {
    return NaN;
  }

  const possibleFields = [

    "live_price",
    "ltp",
    "LTP",

    "lastPrice",
    "last_price",

    "lastTradedPrice",
    "last_traded_price",

    "close",
    "Close",

    "price"

  ];

  for (
    const field of possibleFields
  ) {

    const number =
      Number(quote[field]);

    if (
      Number.isFinite(number) &&
      number > 0
    ) {

      return number;

    }

  }

  return NaN;
}



/*
Display market data.
*/

function renderMarket() {

  if (
    market.nifty.price <= 0
  ) {

    return;

  }

  const niftyChange =
    market.nifty.price -
    market.nifty.previous;

  const bankChange =
    market.banknifty.price -
    market.banknifty.previous;

  setText(
    "niftyPrice",
    formatPrice(
      market.nifty.price
    )
  );

  setText(
    "bankPrice",
    formatPrice(
      market.banknifty.price
    )
  );

  updateChange(
    "niftyChange",
    niftyChange,
    market.nifty.previous
  );

  updateChange(
    "bankChange",
    bankChange,
    market.banknifty.previous
  );

  const niftyTrend =
    calculateTrend(
      market.nifty.history
    );

  const bankTrend =
    calculateTrend(
      market.banknifty.history
    );

  setText(
    "niftyTrend",
    niftyTrend
  );

  setText(
    "bankTrend",
    bankTrend
  );

}


/*
Change display.
*/

function updateChange(
  id,
  change,
  previous
) {

  const element =
    document.getElementById(
      id
    );

  if (!element) {
    return;
  }

  if (
    !previous ||
    previous <= 0
  ) {

    element.textContent =
      "--";

    return;

  }

  const percentage =
    (
      change /
      previous
    ) * 100;

  const sign =
    change >= 0
      ? "+"
      : "";

  element.textContent =
    `${sign}${change.toFixed(2)} ` +
    `(${sign}${percentage.toFixed(3)}%)`;

  element.classList.remove(
    "up",
    "down"
  );

  if (change > 0) {

    element.classList.add(
      "up"
    );

  }

  if (change < 0) {

    element.classList.add(
      "down"
    );

  }

}


/*
Trend engine.

Temporary V3 logic.
We will replace this with
real indicators later.
*/

function calculateTrend(
  history
) {

  if (
    history.length < 5
  ) {

    return "BUILDING";

  }

  const recent =
    history.slice(-5);

  const first =
    recent[0];

  const last =
    recent[
      recent.length - 1
    ];

  if (!first) {
    return "BUILDING";
  }

  const difference =
    last - first;

  const percentage =
    (
      difference /
      first
    ) * 100;

  if (
    percentage > 0.03
  ) {

    return "BULLISH";

  }

  if (
    percentage < -0.03
  ) {

    return "BEARISH";

  }

  return "SIDEWAYS";

}


/*
Market analysis.
*/

/*
REAL MARKET ANALYSIS

Uses:
EMA 9
EMA 21
RSI 14
VWAP

Strategy:
strategy.js
*/

function analyzeMarket() {

  const indicators =
    state.indicators;

  if (
    !indicators ||
    !state.indicatorConnected ||
    !window.TradeMindStrategy
  ) {

    setText(
      "trend",
      "BUILDING"
    );

    setText(
      "momentum",
      "BUILDING"
    );

    setText(
      "volatility",
      "BUILDING"
    );

    setText(
      "signal",
      "WAIT"
    );

    return;

  }


  const price =
    market.nifty.price;


  /*
  Determine trend from
  real EMA values.
  */

  let trend =
    "SIDEWAYS";

  if (
    indicators.ema9 >
    indicators.ema21
  ) {

    trend =
      "BULLISH";

  }

  else if (
    indicators.ema9 <
    indicators.ema21
  ) {

    trend =
      "BEARISH";

  }


  /*
  Determine momentum
  from real RSI.
  */

  let momentum =
    "NEUTRAL";

  if (
    indicators.rsi14 > 50
  ) {

    momentum =
      "POSITIVE";

  }

  else if (
    indicators.rsi14 < 50
  ) {

    momentum =
      "NEGATIVE";

  }


  /*
  Simple volatility label
  for now.

  We will replace this
  with ATR later.
  */

  const volatility =
    calculateVolatility(
      market.nifty.history
    );


  /*
  Run the REAL strategy.
  */

  const result =
    window.TradeMindStrategy
      .generateSignal(

        {
          c: price
        },

        {
          ema9:
            indicators.ema9,

          ema21:
            indicators.ema21,

          rsi14:
            indicators.rsi14,

          vwap:
            indicators.vwap
        }

      );


  const signal =
    result.signal;


  state.signal =
    signal;


  /*
  Update dashboard.
  */

  setText(
    "trend",
    trend
  );

  setText(
    "momentum",
    momentum
  );

  setText(
    "volatility",
    volatility
  );

  setText(
    "signal",
    signal
  );


  setText(
    "analysisStatus",
    "LIVE"
  );


  /*
  Existing trade setup
  will now use the REAL
  strategy signal.
  */

  calculateTradeSetup(
    signal
  );


  console.log(
    "REAL STRATEGY RESULT:",
    result
  );

}


  /*
  Temporary signal engine.

  PAPER ONLY.
  */

  let signal = "HOLD";

  if (
    trend === "BULLISH" &&
    momentum === "POSITIVE"
  ) {

    signal = "BUY";

  }

  if (
    trend === "BEARISH" &&
    momentum === "NEGATIVE"
  ) {

    signal = "SELL";

  }

  state.signal =
    signal;

  setText(
    "signal",
    signal
  );

  setText(
    "analysisStatus",
    state.apiConnected
      ? "LIVE"
      : "OFFLINE"
  );

  calculateTradeSetup(
    signal
  );

}


/*
Momentum calculation.
*/

function calculateMomentum(
  history
) {

  if (
    history.length < 6
  ) {

    return "BUILDING";

  }

  const current =
    history[
      history.length - 1
    ];

  const previous =
    history[
      history.length - 6
    ];

  const movement =
    current - previous;

  if (
    movement > 0
  ) {

    return "POSITIVE";

  }

  if (
    movement < 0
  ) {

    return "NEGATIVE";

  }

  return "NEUTRAL";

}


/*
Volatility calculation.
*/

function calculateVolatility(
  history
) {

  if (
    history.length < 10
  ) {

    return "BUILDING";

  }

  const recent =
    history.slice(-10);

  const highest =
    Math.max(
      ...recent
    );

  const lowest =
    Math.min(
      ...recent
    );

  if (
    lowest <= 0
  ) {

    return "BUILDING";

  }

  const range =
    highest - lowest;

  const percentage =
    (
      range /
      lowest
    ) * 100;

  if (
    percentage > 0.12
  ) {

    return "HIGH";

  }

  if (
    percentage < 0.05
  ) {

    return "LOW";

  }

  return "NORMAL";

}


/*
Trade setup.

PAPER ONLY.
*/

function calculateTradeSetup(
  signal
) {

  if (
    market.nifty.price <= 0
  ) {

    return;

  }

  const entry =
    market.nifty.price;

  if (
    signal === "BUY"
  ) {

    const stoploss =
      entry * 0.9985;

    const target =
      entry * 1.003;

    setText(
      "entry",
      formatPrice(entry)
    );

    setText(
      "stoploss",
      formatPrice(stoploss)
    );

    setText(
      "target",
      formatPrice(target)
    );

    setText(
      "riskReward",
      "1 : 2"
    );

    return;

  }

  if (
    signal === "SELL"
  ) {

    const stoploss =
      entry * 1.0015;

    const target =
      entry * 0.997;

    setText(
      "entry",
      formatPrice(entry)
    );

    setText(
      "stoploss",
      formatPrice(stoploss)
    );

    setText(
      "target",
      formatPrice(target)
    );

    setText(
      "riskReward",
      "1 : 2"
    );

    return;

  }

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

}


/*
Paper trade button.
*/

const paperTradeButton =
  document.getElementById(
    "paperTradeBtn"
  );

if (paperTradeButton) {

  paperTradeButton.addEventListener(
    "click",
    function () {

      if (
        state.signal === "HOLD"
      ) {

        alert(
          "No trade available. " +
          "Signal is HOLD."
        );

        return;

      }

      if (
        market.nifty.price <= 0
      ) {

        alert(
          "Market data is not available."
        );

        return;

      }

      const trade = {

        type:
          state.signal,

        price:
          market.nifty.price,

        time:
          new Date()
            .toLocaleTimeString()

      };

      state.paperTrades.push(
        trade
      );

      alert(
        `PAPER ${state.signal}\n\n` +
        `Price: ₹${formatPrice(
          market.nifty.price
        )}`
      );

    }
  );

}


/*
Market status.

Indian market:
Monday-Friday
09:15-15:30 IST
*/

function updateMarketStatus() {

  const now =
    new Date();

  const day =
    now.getDay();

  const hours =
    now.getHours();

  const minutes =
    now.getMinutes();

  const currentMinutes =
    hours * 60 + minutes;

  const marketOpen =
    day >= 1 &&
    day <= 5 &&
    currentMinutes >= 555 &&
    currentMinutes <= 930;

  const status =
    document.getElementById(
      "marketStatus"
    );

  const dot =
    document.getElementById(
      "statusDot"
    );

  if (!status) {
    return;
  }

  if (marketOpen) {

    status.textContent =
      "MARKET OPEN";

    if (dot) {

      dot.classList.remove(
        "closed"
      );

    }

  } else {

    status.textContent =
      "MARKET CLOSED";

    if (dot) {

      dot.classList.add(
        "closed"
      );

    }

  }

}


/*
Timestamp.
*/

function updateTime() {

  const now =
    new Date();

  setText(
    "lastUpdate",
    now.toLocaleTimeString()
  );

}


/*
Number formatting.
*/

function formatPrice(
  value
) {

  return Number(
    value
  ).toLocaleString(
    "en-IN",
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }
  );

}


/*
Helper.
*/

function setText(
  id,
  value
) {

  const element =
    document.getElementById(
      id
    );

  if (element) {

    element.textContent =
      value;

  }

}


/*
INITIALIZATION
*/

async function initialize() {

  updateMarketStatus();

  setText(
    "analysisStatus",
    "CONNECTING"
  );

  await fetchMarketData();

  await fetchIndicatorData();

}


/*
Refresh market status.
*/

setInterval(
  updateMarketStatus,
  60000
);


/*
Refresh REAL market data.

5 seconds for now.

Later we'll switch to
WebSocket streaming.
*/

setInterval(
  fetchMarketData,
  5000
);


initialize();

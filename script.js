/*
  TradeMind Pro
  V2 Market Data Engine

  IMPORTANT:
  This is currently a DEMO market feed.

  No real trades are placed.
  No broker is connected.
*/


const market = {

  nifty: {
    price: 24750,
    previous: 24720,
    history: []
  },

  banknifty: {
    price: 55900,
    previous: 55840,
    history: []
  }

};


const state = {

  signal: "WAIT",

  paperTrades: [],

  lastUpdate: null

};


/*
  Generate realistic-looking price movement
*/

function randomMovement(price) {

  const movement =
    (Math.random() - 0.48)
    * price
    * 0.0007;

  return price + movement;

}


/*
  Update market prices
*/

function updateMarket() {

  market.nifty.previous =
    market.nifty.price;

  market.banknifty.previous =
    market.banknifty.price;


  market.nifty.price =
    randomMovement(
      market.nifty.price
    );


  market.banknifty.price =
    randomMovement(
      market.banknifty.price
    );


  market.nifty.history.push(
    market.nifty.price
  );


  market.banknifty.history.push(
    market.banknifty.price
  );


  /*
    Keep last 30 observations
  */

  if (
    market.nifty.history.length > 30
  ) {

    market.nifty.history.shift();

  }


  if (
    market.banknifty.history.length > 30
  ) {

    market.banknifty.history.shift();

  }


  renderMarket();

  analyzeMarket();

  updateTime();

}


/*
  Display market data
*/

function renderMarket() {

  const niftyChange =
    market.nifty.price
    - market.nifty.previous;


  const bankChange =
    market.banknifty.price
    - market.banknifty.previous;


  setText(
    "niftyPrice",
    formatPrice(market.nifty.price)
  );


  setText(
    "bankPrice",
    formatPrice(market.banknifty.price)
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
  Change display
*/

function updateChange(
  id,
  change,
  previous
) {

  const element =
    document.getElementById(id);


  if (!element) return;


  const percentage =
    (change / previous) * 100;


  const sign =
    change >= 0
      ? "+"
      : "";


  element.textContent =
    `${sign}${change.toFixed(2)}
     (${sign}${percentage.toFixed(3)}%)`;


  element.classList.remove(
    "up",
    "down"
  );


  if (change > 0) {

    element.classList.add("up");

  }


  if (change < 0) {

    element.classList.add("down");

  }

}


/*
  Trend engine

  This is intentionally simple for V2.
  We will replace it with real indicators
  later.
*/

function calculateTrend(history) {

  if (history.length < 5) {

    return "BUILDING";

  }


  const recent =
    history.slice(-5);


  const first =
    recent[0];


  const last =
    recent[recent.length - 1];


  const difference =
    last - first;


  const percentage =
    (difference / first)
    * 100;


  if (percentage > 0.03) {

    return "BULLISH";

  }


  if (percentage < -0.03) {

    return "BEARISH";

  }


  return "SIDEWAYS";

}


/*
  Market analysis
*/

function analyzeMarket() {

  const trend =
    calculateTrend(
      market.nifty.history
    );


  const momentum =
    calculateMomentum(
      market.nifty.history
    );


  const volatility =
    calculateVolatility(
      market.nifty.history
    );


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


  /*
    Temporary signal engine.

    This will NOT be used for live trading.
  */

  let signal = "HOLD";


  if (
    trend === "BULLISH"
    &&
    momentum === "POSITIVE"
  ) {

    signal = "BUY";

  }


  if (
    trend === "BEARISH"
    &&
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
    "ACTIVE"
  );


  calculateTradeSetup(
    signal
  );

}


/*
  Momentum calculation
*/

function calculateMomentum(history) {

  if (history.length < 6) {

    return "BUILDING";

  }


  const current =
    history[history.length - 1];


  const previous =
    history[history.length - 6];


  const movement =
    current - previous;


  if (movement > 0) {

    return "POSITIVE";

  }


  if (movement < 0) {

    return "NEGATIVE";

  }


  return "NEUTRAL";

}


/*
  Volatility calculation
*/

function calculateVolatility(history) {

  if (history.length < 10) {

    return "BUILDING";

  }


  const recent =
    history.slice(-10);


  const highest =
    Math.max(...recent);


  const lowest =
    Math.min(...recent);


  const range =
    highest - lowest;


  const percentage =
    (range / lowest) * 100;


  if (percentage > 0.12) {

    return "HIGH";

  }


  if (percentage < 0.05) {

    return "LOW";

  }


  return "NORMAL";

}


/*
  Trade setup

  Again: PAPER ONLY.
*/

function calculateTradeSetup(signal) {

  const entry =
    market.nifty.price;


  if (signal === "BUY") {

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


  if (signal === "SELL") {

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
  Paper trade button
*/

document
  .getElementById(
    "paperTradeBtn"
  )
  .addEventListener(
    "click",
    function () {

      if (
        state.signal === "HOLD"
      ) {

        alert(
          "No trade available. Signal is HOLD."
        );

        return;

      }


      const trade = {

        type: state.signal,

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
        `PAPER ${state.signal}\n\n`
        +
        `Price: ₹${formatPrice(
          market.nifty.price
        )}`
      );

    }
  );


/*
  Market status

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
    day >= 1
    &&
    day <= 5
    &&
    currentMinutes >= 555
    &&
    currentMinutes <= 930;


  const status =
    document.getElementById(
      "marketStatus"
    );


  const dot =
    document.getElementById(
      "statusDot"
    );


  if (marketOpen) {

    status.textContent =
      "MARKET OPEN";


    dot.classList.remove(
      "closed"
    );

  } else {

    status.textContent =
      "MARKET CLOSED";


    dot.classList.add(
      "closed"
    );

  }

}


/*
  Timestamp
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
  Number formatting
*/

function formatPrice(value) {

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
  Helper
*/

function setText(
  id,
  value
) {

  const element =
    document.getElementById(id);


  if (element) {

    element.textContent =
      value;

  }

}


/*
  INITIALIZATION
*/

function initialize() {

  /*
    Seed history
  */

  for (
    let i = 0;
    i < 15;
    i++
  ) {

    market.nifty.history.push(
      market.nifty.price
    );


    market.banknifty.history.push(
      market.banknifty.price
    );

  }


  updateMarketStatus();

  updateMarket();

}


/*
  Refresh market status
  every minute.
*/

setInterval(
  updateMarketStatus,
  60000
);


/*
  Demo feed update
  every 3 seconds.

  Later this becomes real market data.
*/

setInterval(
  updateMarket,
  3000
);


initialize();

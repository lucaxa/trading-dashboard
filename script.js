const state = {
  marketConnected: false,
  paperTrades: []
};

function setText(id, value) {
  const element = document.getElementById(id);

  if (element) {
    element.textContent = value;
  }
}

function initializeDashboard() {

  setText("trend", "WAITING");
  setText("momentum", "WAITING");
  setText("volatility", "WAITING");
  setText("signal", "WAIT");

  setText("entry", "--");
  setText("stoploss", "--");
  setText("target", "--");
  setText("riskReward", "--");

  setText("dataStatus", "NOT CONNECTED");
}

document
  .getElementById("paperTradeBtn")
  .addEventListener("click", () => {

    alert(
      "Paper trading engine will be connected after market data and strategy modules are ready."
    );

  });

initializeDashboard();

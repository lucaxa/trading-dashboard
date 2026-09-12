import assert from "node:assert/strict";
import test from "node:test";

import {
    evaluateMultiStockSignal,
    MULTI_STOCK_SIGNAL_VERSION
} from "./multi-stock-signal-v1.js";


function makeCandles(count = 80) {

    const candles = [];

    let price = 100;

    for (let i = 0; i < count; i++) {

        const open = price;

        const close =
            price +
            (
                i % 3 === 0
                    ? 0.35
                    : 0.20
            );

        const high =
            Math.max(open, close) + 0.20;

        const low =
            Math.min(open, close) - 0.20;

        candles.push({

            ts:
                1_700_000_000 +
                i * 300,

            o: open,
            h: high,
            l: low,
            c: close,
            v: 1000

        });

        price = close;
    }

    return candles;
}


const instrument = {

    symbol: "INFY",

    securityId: "12345",

    exchange: "NSE",

    segment: "EQUITY"

};


test(
    "Component 3 evaluates one equity through the frozen signal engine",
    () => {

        const result =
            evaluateMultiStockSignal({

                instrument,

                candles:
                    makeCandles(),

                // Force the latest candle to be treated
                // as completed for this deterministic test.
                nowMs:
                    2_000_000_000_000

            });


        assert.equal(
            result.version,
            MULTI_STOCK_SIGNAL_VERSION
        );

        assert.equal(
            result.strategy,
            "V10.20"
        );

        assert.equal(
            result.engineVersion,
            result.engineVersion
        );

        assert.equal(
            result.symbol,
            "INFY"
        );

        assert.equal(
            result.instrument.securityId,
            "12345"
        );

        assert.ok(
            [
                "BUY",
                "SELL",
                "WAIT"
            ].includes(
                result.signal
            )
        );

        assert.equal(
            result.safety.researchOnly,
            true
        );

        assert.equal(
            result.safety.paperOnly,
            true
        );

        assert.equal(
            result.safety.realOrders,
            false
        );

        assert.equal(
            result.safety.brokerOrderEnabled,
            false
        );

    }
);


test(
    "Component 3 rejects insufficient candle history safely",
    () => {

        const result =
            evaluateMultiStockSignal({

                instrument,

                candles:
                    makeCandles(10),

                nowMs:
                    2_000_000_000_000

            });


        assert.equal(
            result.signal,
            "WAIT"
        );

        assert.equal(
            result.status,
            "INSUFFICIENT_DATA"
        );

    }
);


test(
    "Component 3 rejects incomplete instrument identity",
    () => {

        assert.throws(
            () =>
                evaluateMultiStockSignal({

                    instrument: {
                        symbol: "INFY"
                    },

                    candles:
                        makeCandles()

                }),
            /Security ID is required/
        );

    }
);


test(
    "Component 3 keeps strategy execution isolated from paper execution",
    () => {

        const result =
            evaluateMultiStockSignal({

                instrument: {
                    symbol: "SBIN",
                    securityId: "54321",
                    exchange: "NSE",
                    segment: "EQUITY"
                },

                candles:
                    makeCandles(),

                nowMs:
                    2_000_000_000_000

            });


        assert.equal(
            result.safety.learningEnabled,
            false
        );

        assert.equal(
            result.safety.strategyMutation,
            false
        );

        assert.equal(
            result.safety.parameterOptimization,
            false
        );

        assert.equal(
            result.safety.promotionEnabled,
            false
        );

    }
);

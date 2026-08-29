function numberOrNull(value) {

    const n = Number(value);

    return Number.isFinite(n)
        ? n
        : null;

}


function getTimestamp(candle) {

    return Number(
        candle?.ts ??
        candle?.timestamp ??
        candle?.time
    );

}


function getOpen(candle) {
    return numberOrNull(
        candle?.o ??
        candle?.open
    );
}


function getHigh(candle) {
    return numberOrNull(
        candle?.h ??
        candle?.high
    );
}


function getLow(candle) {
    return numberOrNull(
        candle?.l ??
        candle?.low
    );
}


function getClose(candle) {
    return numberOrNull(
        candle?.c ??
        candle?.close
    );
}


/*
 * Build a market-context observation from the most recent
 * completed historical session.
 *
 * This function does not fetch data.
 * It only interprets supplied historical candles.
 */
export function buildMarketContext({

    symbol,

    candles = [],

    marketDate

} = {}) {

    if (!symbol) {
        throw new Error(
            "symbol is required"
        );
    }

    if (!marketDate) {
        throw new Error(
            "marketDate is required"
        );
    }

    if (!Array.isArray(candles)) {
        throw new Error(
            "candles must be an array"
        );
    }


    const valid =
        candles
            .map(candle => ({

                raw: candle,

                ts:
                    getTimestamp(candle),

                open:
                    getOpen(candle),

                high:
                    getHigh(candle),

                low:
                    getLow(candle),

                close:
                    getClose(candle)

            }))
            .filter(item =>

                Number.isFinite(item.ts) &&

                item.open !== null &&

                item.high !== null &&

                item.low !== null &&

                item.close !== null

            )
            .sort(
                (a, b) =>
                    a.ts - b.ts
            );


    if (valid.length === 0) {

        throw new Error(
            "No valid candles supplied"
        );

    }


    const previous =
        valid[valid.length - 1];


    const first =
        valid[0];


    const sessionReturn =
        first.open !== 0
            ? (
                (
                    previous.close -
                    first.open
                ) /
                first.open
            ) * 100
            : null;


    return {

        type:
            "MARKET_CONTEXT",

        symbol,

        marketDate,

        source:
            "HISTORICAL_CANDLES",

        timestamp:
            previous.ts,

        data: {

            open:
                previous.open,

            high:
                previous.high,

            low:
                previous.low,

            close:
                previous.close,

            sessionReturnPct:
                sessionReturn,

            candleCount:
                valid.length

        }

    };

}

import {
    filterRegularSessionCandles
} from "../market/session.js";


export function calculateRegimeEvidence({

    symbol,

    marketDate,

    candles = []

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


    const sessionCandles =
        filterRegularSessionCandles(
            candles,
            marketDate
        );


    if (
        sessionCandles.length === 0
    ) {

        return {

            symbol,

            marketDate,

            valid:
                false,

            candleCount:
                0,

            sessionOpen:
                null,

            sessionHigh:
                null,

            sessionLow:
                null,

            sessionClose:
                null,

            sessionReturn:
                null,

            sessionRange:
                null,

            rangePercent:
                null,

            closeLocation:
                null,

            direction:
                "UNKNOWN"

        };

    }


    const first =
        sessionCandles[0];

    const last =
        sessionCandles[
            sessionCandles.length - 1
        ];


    const sessionOpen =
        Number(first.o);

    const sessionClose =
        Number(last.c);


    const highs =
        sessionCandles
            .map(
                candle =>
                    Number(candle.h)
            )
            .filter(
                Number.isFinite
            );


    const lows =
        sessionCandles
            .map(
                candle =>
                    Number(candle.l)
            )
            .filter(
                Number.isFinite
            );


    const sessionHigh =
        Math.max(
            ...highs
        );


    const sessionLow =
        Math.min(
            ...lows
        );


    if (
        !Number.isFinite(sessionOpen) ||
        !Number.isFinite(sessionClose) ||
        !Number.isFinite(sessionHigh) ||
        !Number.isFinite(sessionLow) ||
        sessionOpen <= 0
    ) {

        return {

            symbol,

            marketDate,

            valid:
                false,

            candleCount:
                sessionCandles.length,

            sessionOpen:
                null,

            sessionHigh:
                null,

            sessionLow:
                null,

            sessionClose:
                null,

            sessionReturn:
                null,

            sessionRange:
                null,

            rangePercent:
                null,

            closeLocation:
                null,

            direction:
                "UNKNOWN"

        };

    }


    const sessionReturn =
        (
            sessionClose -
            sessionOpen
        ) /
        sessionOpen;


    const sessionRange =
        sessionHigh -
        sessionLow;


    const rangePercent =
        sessionRange /
        sessionOpen;


    const closeLocation =
        sessionRange === 0

            ? 0.5

            :

            (
                sessionClose -
                sessionLow
            ) /
            sessionRange;


    let direction =
        "FLAT";


    if (
        sessionClose >
        sessionOpen
    ) {

        direction =
            "UP";

    }

    else if (
        sessionClose <
        sessionOpen
    ) {

        direction =
            "DOWN";

    }


    return {

        symbol,

        marketDate,

        valid:
            true,

        candleCount:
            sessionCandles.length,

        sessionOpen,

        sessionHigh,

        sessionLow,

        sessionClose,

        sessionReturn,

        sessionRange,

        rangePercent,

        closeLocation,

        direction

    };

}

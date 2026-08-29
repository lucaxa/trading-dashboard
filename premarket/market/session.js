const MARKET_OPEN_MINUTES =
    9 * 60 + 15;

const MARKET_CLOSE_MINUTES =
    15 * 60 + 30;


function getTimestamp(candle) {

    const value =
        Number(
            candle?.ts ??
            candle?.timestamp ??
            candle?.time
        );

    return Number.isFinite(value)
        ? value
        : null;

}


function getISTParts(timestamp) {

    const date =
        new Date(timestamp * 1000);

    const formatter =
        new Intl.DateTimeFormat(
            "en-CA",
            {
                timeZone: "Asia/Kolkata",
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                hourCycle: "h23"
            }
        );

    const parts =
        Object.fromEntries(
            formatter
                .formatToParts(date)
                .filter(
                    part =>
                        part.type !== "literal"
                )
                .map(
                    part =>
                        [
                            part.type,
                            part.value
                        ]
                )
        );

    return {

        date:
            `${parts.year}-${parts.month}-${parts.day}`,

        hour:
            Number(parts.hour),

        minute:
            Number(parts.minute),

        second:
            Number(parts.second)

    };

}


function minutesFromMidnight(parts) {

    return (
        parts.hour * 60 +
        parts.minute
    );

}


export function classifyCandleSession(
    timestamp
) {

    const parts =
        getISTParts(timestamp);

    const minutes =
        minutesFromMidnight(parts);


    if (
        minutes <
        MARKET_OPEN_MINUTES
    ) {

        return "PRE_MARKET";

    }


    if (
        minutes >=
        MARKET_OPEN_MINUTES &&
        minutes <=
        MARKET_CLOSE_MINUTES
    ) {

        return "REGULAR_SESSION";

    }


    return "POST_MARKET";

}


export function filterRegularSessionCandles(
    candles = [],
    marketDate
) {

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


    return candles
        .filter(candle => {

            const timestamp =
                getTimestamp(candle);

            if (
                timestamp === null
            ) {

                return false;

            }


            const parts =
                getISTParts(timestamp);


            if (
                parts.date !==
                marketDate
            ) {

                return false;

            }


            return (
                classifyCandleSession(
                    timestamp
                ) ===
                "REGULAR_SESSION"
            );

        })
        .sort(
            (a, b) =>
                getTimestamp(a) -
                getTimestamp(b)
        );

}


export function filterPreMarketInformation(
    items = [],
    cutoff
) {

    if (!Array.isArray(items)) {

        throw new Error(
            "items must be an array"
        );

    }


    if (!cutoff) {

        throw new Error(
            "cutoff is required"
        );

    }


    const cutoffTime =
        new Date(cutoff).getTime();


    if (
        !Number.isFinite(cutoffTime)
    ) {

        throw new Error(
            "cutoff is invalid"
        );

    }


    return items.filter(item => {

        if (
            !item?.publishedAt
        ) {

            return false;

        }


        const published =
            new Date(
                item.publishedAt
            ).getTime();


        if (
            !Number.isFinite(
                published
            )
        ) {

            return false;

        }


        return (
            published <=
            cutoffTime
        );

    });

}


export const MARKET_SESSION = Object.freeze({

    timezone:
        "Asia/Kolkata",

    open:
        "09:15",

    close:
        "15:30"

});

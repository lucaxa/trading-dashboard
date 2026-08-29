import {
    buildPreMarketSnapshot
} from "../evidence/builder.js";

import {
    filterRegularSessionCandles
} from "../market/session.js";

import {
    buildMarketContext
} from "../market/context.js";

import {
    previousTradingDay
} from "../calendar/trading-days.js";


export function replayHistoricalMorning({

    marketDate,

    cutoff,

    previousSessionCandles = [],

    preMarketEvidence = [],

    marketSymbol = "NIFTY 50"

} = {}) {

    if (!marketDate) {

        throw new Error(
            "marketDate is required"
        );

    }


    if (!cutoff) {

        throw new Error(
            "cutoff is required"
        );

    }


    const previousSessionDate =
        previousTradingDay(
            marketDate
        );


    const previousSession =
        filterRegularSessionCandles(

            previousSessionCandles,

            previousSessionDate

        );


    if (
        previousSession.length === 0
    ) {

        throw new Error(
            "Previous session contains no valid candles"
        );

    }


    const marketContext =
        buildMarketContext({

            symbol:
                marketSymbol,

            marketDate:
                previousSessionDate,

            candles:
                previousSession

        });


    const snapshot =
        buildPreMarketSnapshot({

            marketDate,

            cutoff,

            evidence:
                preMarketEvidence

        });


    const contextEvidence = {

        source:
            marketContext.source,

        type:
            marketContext.type,

        symbol:
            marketContext.symbol,

        publishedAt:
            cutoff,

        observedAt:
            cutoff,

        data:
            marketContext.data

    };


    snapshot.marketContext.push(
        contextEvidence
    );


    snapshot.evidence.push(
        contextEvidence
    );


    snapshot.metadata.replay = {

        historical:
            true,

        previousSessionDate,

        currentSessionCandlesUsed:
            false,

        futureInformationUsed:
            false

    };


    return snapshot;

}

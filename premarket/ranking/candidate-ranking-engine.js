/*
============================================================
TradeMind Pro

PMSE Candidate Ranking Engine

Purpose:

Rank equity candidates using measurable
pre-market features.

This module does NOT:
- create trades
- place orders
- generate buy/sell signals

Selection layer only.
============================================================
*/


export const PMSE_RANKING_VERSION =
    "PMSE-CANDIDATE-RANKING-V1";



function clamp(
    value,
    min,
    max
) {

    return Math.min(
        Math.max(
            value,
            min
        ),
        max
    );

}



function calculateScore(features = {}) {


    const momentum =
        clamp(
            Number(features.priceChangePct || 0) * 10,
            0,
            40
        );


    const volume =
        clamp(
            Number(features.volumeRatio || 0) * 20,
            0,
            40
        );


    const volatility =
        clamp(
            Number(features.range || 0) * 2,
            0,
            20
        );


    return Math.round(
        momentum +
        volume +
        volatility
    );

}





export function rankCandidates({

    stocks = []

} = {}) {


    if (
        !Array.isArray(stocks)
    ) {

        throw new Error(
            "stocks must be an array"
        );

    }


    const ranked =
        stocks.map(
            stock => ({

                symbol:
                    stock.symbol
                        .trim()
                        .toUpperCase(),

                score:
                    calculateScore(
                        stock.features
                    )

            })
        );


    ranked.sort(
        (
            a,
            b
        ) =>
            b.score -
            a.score
    );


    return {

        version:
            PMSE_RANKING_VERSION,

        candidates:
            ranked,

        metadata: {

            researchOnly:
                true,

            tradingEnabled:
                false,

            brokerCalled:
                false,

            signalCreated:
                false

        }

    };

}

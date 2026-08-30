/*
============================================================
TradeMind Pro
PMSE M2.4 — Forward Outcome Measurement
============================================================

Purpose:
Measure the actual market outcome AFTER the frozen
M2 regime decision cutoff.

Critical boundary:

    decision cutoff
            |
            v
    REGIME DECISION
            |
            |  no feedback
            v
    FORWARD SESSION
            |
            v
    OUTCOME MEASUREMENT

This module NEVER modifies the regime decision.

Research only.
No orders.
No broker.
============================================================
*/

import {
    filterRegularSessionCandles
} from "../market/session.js";

import {
    createForwardOutcome,
    OUTCOME_STATES
} from "./models.js";


function numberOrNull(value) {

    const number =
        Number(value);

    return Number.isFinite(number)
        ? number
        : null;

}


function candleTimestamp(candle) {

    return Number(
        candle?.ts ??
        candle?.timestamp ??
        candle?.time
    );

}


function candleOpen(candle) {

    return numberOrNull(
        candle?.o ??
        candle?.open
    );

}


function candleHigh(candle) {

    return numberOrNull(
        candle?.h ??
        candle?.high
    );

}


function candleLow(candle) {

    return numberOrNull(
        candle?.l ??
        candle?.low
    );

}


function candleClose(candle) {

    return numberOrNull(
        candle?.c ??
        candle?.close
    );

}


function normalizeCandles(candles) {

    if (!Array.isArray(candles)) {

        return [];

    }


    return candles

        .map(candle => ({

            ts:
                candleTimestamp(candle),

            open:
                candleOpen(candle),

            high:
                candleHigh(candle),

            low:
                candleLow(candle),

            close:
                candleClose(candle)

        }))

        .filter(candle =>

            Number.isFinite(candle.ts) &&

            candle.open !== null &&

            candle.high !== null &&

            candle.low !== null &&

            candle.close !== null

        )

        .sort(
            (a, b) =>
                a.ts - b.ts
        );

}


export function measureForwardOutcome({

    marketDate,

    decisionCutoff,

    candles = []

} = {}) {

    if (!marketDate) {

        throw new Error(
            "marketDate is required"
        );

    }


    if (!decisionCutoff) {

        throw new Error(
            "decisionCutoff is required"
        );

    }


    /*
     * Only regular-session candles belonging to the
     * requested market date are eligible.
     */
    const sessionCandles =
        filterRegularSessionCandles(
            candles,
            marketDate
        );


    const normalized =
        normalizeCandles(
            sessionCandles
        );


    /*
     * No usable forward session.
     */
    if (
        normalized.length === 0
    ) {

        return createForwardOutcome({

            marketDate,

            decisionCutoff,

            state:
                OUTCOME_STATES.UNKNOWN,

            candleCount:
                0

        });

    }


    const first =
        normalized[0];


    const sessionOpen =
        first.open;


    if (
        !Number.isFinite(sessionOpen) ||
        sessionOpen <= 0
    ) {

        return createForwardOutcome({

            marketDate,

            decisionCutoff,

            state:
                OUTCOME_STATES.UNKNOWN,

            candleCount:
                normalized.length

        });

    }


    const sessionClose =
        normalized[
            normalized.length - 1
        ].close;


    const sessionHigh =
        Math.max(
            ...normalized.map(
                candle =>
                    candle.high
            )
        );


    const sessionLow =
        Math.min(
            ...normalized.map(
                candle =>
                    candle.low
            )
        );


    const sessionReturnPct =
        (
            (
                sessionClose -
                sessionOpen
            ) /
            sessionOpen
        ) * 100;


    const maxFavourableMovePct =
        (
            (
                sessionHigh -
                sessionOpen
            ) /
            sessionOpen
        ) * 100;


    const maxAdverseMovePct =
        (
            (
                sessionLow -
                sessionOpen
            ) /
            sessionOpen
        ) * 100;


    let state =
        OUTCOME_STATES.FLAT;


    if (
        sessionReturnPct > 0
    ) {

        state =
            OUTCOME_STATES.POSITIVE;

    }

    else if (
        sessionReturnPct < 0
    ) {

        state =
            OUTCOME_STATES.NEGATIVE;

    }


   return createForwardOutcome({

    marketDate,

    decisionCutoff,

    sessionOpen,

    sessionClose,

    sessionHigh,

    sessionLow,

    sessionReturnPct,

    maxFavourableMovePct,

    maxAdverseMovePct,

    state,

   candleCount:
    normalized.length

});
}
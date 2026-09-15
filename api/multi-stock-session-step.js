/*
============================================================
TradeMind Pro

A11 Multi-Stock Session Step API

Purpose:

Expose one stateless four-stock paper session step.

This API does NOT:
- place real orders
- call broker order APIs
- learn
- optimize
- mutate strategy
- promote anything

INDSTOCKS_TOKEN remains server-side.
Session state and cursors are supplied by the caller.
============================================================
*/

import {
    runPMSE
}
from "../premarket/pipeline/pmse-runner.js";

import {
    previousTradingDay
}
from "../premarket/calendar/trading-days.js";

import {
    getPMSEUniverse
}
from "../premarket/scanner/pmse-universe-provider.js";

import {
    getPMSEStocks
}
from "../premarket/equity-data/pmse-stock-provider.js";

import {
    resolveEquityInstruments
}
from "../premarket/equity-data/indstocks-equity-instrument-provider.js";

import {
    runMultiStockSessionStep
}
from "../research/phase11/multi-stock-paper/multi-stock-session-step-v1.js";


const INSTRUMENTS_URL =
    "https://api.indstocks.com/market/instruments?source=equity";


function createResearchWindow() {

    const now =
        new Date();

    const marketDate =
        new Intl.DateTimeFormat(
            "en-CA",
            {
                timeZone:
                    "Asia/Kolkata",

                year:
                    "numeric",

                month:
                    "2-digit",

                day:
                    "2-digit"
            }
        ).format(now);

    const previousSessionDate =
        previousTradingDay(
            marketDate
        );

    const sessionEnd =
        new Date(
            `${previousSessionDate}T15:30:00+05:30`
        );

    const sessionStart =
        new Date(
            sessionEnd.getTime() -
            (
                6.5 *
                60 *
                60 *
                1000
            )
        );

    return {
        startTime:
            sessionStart.getTime(),

        endTime:
            sessionEnd.getTime()
    };
}


async function fetchInstrumentCsv({
    accessToken
}) {

    const response =
        await fetch(
            INSTRUMENTS_URL,
            {
                method:
                    "GET",

                headers: {
                    Authorization:
                        accessToken,

                    Accept:
                        "text/csv"
                }
            }
        );

    if (!response.ok) {
        throw new Error(
            `INDstocks instrument API failed: HTTP ${response.status}`
        );
    }

    return await response.text();
}


function validateRequestBody(body) {

    if (
        !body ||
        typeof body !== "object"
    ) {
        throw new Error(
            "Request body is required"
        );
    }

    if (
        !body.state ||
        typeof body.state !== "object"
    ) {
        throw new Error(
            "state is required"
        );
    }

    if (
        !body.cursorState ||
        typeof body.cursorState !== "object"
    ) {
        throw new Error(
            "cursorState is required"
        );
    }

    if (
        body.nowMs !== undefined &&
        !Number.isFinite(
            Number(body.nowMs)
        )
    ) {
        throw new Error(
            "nowMs must be finite"
        );
    }
}


function selectNSEEquityInstruments({
    symbols,
    resolved
}) {

    return symbols.map(
        symbol => {

            const matches =
                resolved.filter(
                    item =>
                        item?.symbol ===
                        symbol
                );

            const selected =
                matches.find(
                    item =>
                        item.exchange === "NSE" &&
                        item.segment === "E"
                );

            if (!selected) {
                throw new Error(
                    `No NSE equity instrument found for ${symbol}`
                );
            }

            return selected;
        }
    );
}


export async function runMultiStockSessionStepAPI({
    state,
    cursorState,
    accessToken,
    nowMs,
    getUniverse = getPMSEUniverse,
    resolveInstruments = resolveEquityInstruments,
    getStocks = getPMSEStocks,
    runPMSEPipeline = runPMSE,
    runSessionStep = runMultiStockSessionStep,
    fetchInstrumentCsvFn = fetchInstrumentCsv,
    createWindow = createResearchWindow
} = {}) {

    if (!accessToken) {
        throw new Error(
            "INDSTOCKS_TOKEN is not configured"
        );
    }

    validateRequestBody({
        state,
        cursorState,
        nowMs
    });

    const universe =
        getUniverse();

    const symbols =
        universe
            .universe
            .symbols;

    const csv =
        await fetchInstrumentCsvFn({
            accessToken
        });

    const resolved =
        resolveInstruments({
            symbols,
            csv
        });

    const stocks =
        await getStocks({
            symbols,
            instruments:
                resolved,
            accessToken,
            window:
                createWindow()
        });

    const pmseResult =
        await runPMSEPipeline({
            stocks
        });

    const candidates =
        pmseResult?.output?.candidates;

    if (
        !Array.isArray(candidates)
    ) {
        throw new Error(
            "PMSE did not return candidates"
        );
    }

    const candidateSymbols =
        candidates
            .map(
                candidate =>
                    candidate?.symbol
            )
            .filter(
                symbol =>
                    typeof symbol ===
                    "string"
            )
            .slice(0, 3);

    if (
        candidateSymbols.length !== 3
    ) {
        throw new Error(
            "PMSE did not return exactly three candidates"
        );
    }

    const resolvedCandidates =
        selectNSEEquityInstruments({
            symbols:
                candidateSymbols,
            resolved
        });

    const sessionResult =
        await runSessionStep({
            pmseInput:
                pmseResult.output,

            resolvedPMSEInstruments:
                resolvedCandidates,

            state,

            cursorState,

            accessToken,

            nowMs:
                nowMs === undefined
                    ? Date.now()
                    : Number(nowMs)
        });

    return {
        status:
            "READY",

        pmse:
            pmseResult.output,

        resolvedPMSEInstruments:
            resolvedCandidates,

        session:
            sessionResult
    };
}


export default async function handler(
    request,
    response
) {

    if (
        request.method !== "POST"
    ) {

        return response
            .status(405)
            .json({
                status:
                    "ERROR",

                error:
                    "Method not allowed"
            });
    }

    try {

        const accessToken =
            process.env.INDSTOCKS_TOKEN;

        if (!accessToken) {

            return response
                .status(500)
                .json({
                    status:
                        "ERROR",

                    error:
                        "INDSTOCKS_TOKEN is not configured"
                });
        }

        validateRequestBody(
            request.body
        );

        const result =
            await runMultiStockSessionStepAPI({
                state:
                    request.body.state,

                cursorState:
                    request.body.cursorState,

                accessToken,

                nowMs:
                    request.body.nowMs
            });

        return response
            .status(200)
            .json(
                result
            );

    }
    catch (error) {

        console.error(
            "Multi-stock session step error:",
            error
        );

        return response
            .status(500)
            .json({
                status:
                    "ERROR",

                error:
                    error.message
            });
    }
}

/*
============================================================
TradeMind Pro

A11 Multi-Stock Session State V1

Purpose:

Persist the existing four-stock paper-trading state and
forward cursors so a paper session can safely continue
across process restarts.

This module does NOT:
- generate signals
- modify V10.20
- modify V10.25
- fetch market data
- call PMSE
- call brokers
- create real orders
- learn
- optimize
- mutate strategy
- promote anything
============================================================
*/

import fs from "node:fs";
import path from "node:path";

import {
    createMultiStockState
} from "./multi-stock-state-v1.js";

import {
    createMultiStockForwardCursor
} from "./multi-stock-forward-coordinator-v1.js";


export const MULTI_STOCK_SESSION_STATE_VERSION =
    "A11-MULTI-STOCK-SESSION-STATE-V1";


const SAFETY = Object.freeze({

    mode: "PAPER_ONLY",

    researchOnly: true,

    tradingEnabled: false,

    brokerCalled: false,

    orderCreationEnabled: false,

    learningEnabled: false,

    strategyMutation: false,

    optimizationEnabled: false,

    promotionEnabled: false

});


function normalizeSymbol(symbol) {

    if (
        typeof symbol !== "string"
    ) {
        return null;
    }

    const clean =
        symbol
            .trim()
            .toUpperCase();

    return clean.length > 0
        ? clean
        : null;
}


function normalizeSessionDate(
    sessionDate
) {

    if (
        typeof sessionDate !== "string"
    ) {
        return null;
    }

    const clean =
        sessionDate.trim();

    return clean.length > 0
        ? clean
        : null;
}


function normalizeInstruments(
    instruments
) {

    if (
        !Array.isArray(instruments) ||
        instruments.length === 0
    ) {

        throw new Error(
            "At least one instrument is required"
        );

    }

    const normalized = [];
    const symbols = new Set();

    for (
        const instrument of instruments
    ) {

        const symbol =
            normalizeSymbol(
                instrument?.symbol
            );

        if (!symbol) {

            throw new Error(
                "Every instrument must have a valid symbol"
            );

        }

        if (
            symbols.has(symbol)
        ) {

            throw new Error(
                `Duplicate instrument: ${symbol}`
            );

        }

        symbols.add(symbol);

        normalized.push({

            symbol,

            instrumentType:
                instrument?.instrumentType ?? null,

            source:
                instrument?.source ?? null,

            securityId:
                instrument?.securityId ?? null,

            exchange:
                instrument?.exchange ?? null,

            segment:
                instrument?.segment ?? null

        });

    }

    return normalized;
}


function validateSafetyObject(
    object,
    label
) {

    for (
        const [key, expected]
        of Object.entries(SAFETY)
    ) {

        if (
            object?.[key] !== expected
        ) {

            throw new Error(
                `${label} safety violation: ${key}`
            );

        }

    }

}


function validateCursorState(
    cursorState,
    instruments
) {

    if (
        !cursorState ||
        typeof cursorState !== "object"
    ) {

        throw new Error(
            "cursorState is required"
        );

    }

    const expectedSymbols =
        instruments
            .map(
                instrument =>
                    instrument.symbol
            )
            .sort();

    const actualSymbols =
        Object.keys(
            cursorState.cursors ?? {}
        )
            .map(normalizeSymbol)
            .filter(Boolean)
            .sort();

    if (
        JSON.stringify(
            actualSymbols
        ) !==
        JSON.stringify(
            expectedSymbols
        )
    ) {

        throw new Error(
            "Cursor universe does not match session universe"
        );

    }

    for (
        const symbol of expectedSymbols
    ) {

        const cursor =
            cursorState.cursors[symbol];

        if (
            !cursor ||
            (
                cursor.lastProcessedCandleTs !== null &&
                !Number.isFinite(
                    cursor.lastProcessedCandleTs
                )
            )
        ) {

            throw new Error(
                `Invalid cursor state: ${symbol}`
            );

        }

    }

}


function validateState(
    state,
    instruments
) {

    if (
        !state ||
        typeof state !== "object"
    ) {

        throw new Error(
            "state is required"
        );

    }

    validateSafetyObject(
        state,
        "State"
    );

    const expectedSymbols =
        instruments
            .map(
                instrument =>
                    instrument.symbol
            )
            .sort();

    const actualSymbols =
        Object.keys(
            state.stocks ?? {}
        )
            .map(normalizeSymbol)
            .filter(Boolean)
            .sort();

    if (
        JSON.stringify(
            actualSymbols
        ) !==
        JSON.stringify(
            expectedSymbols
        )
    ) {

        throw new Error(
            "State universe does not match session universe"
        );

    }

    for (
        const symbol of expectedSymbols
    ) {

        const stock =
            state.stocks[symbol];

        if (
            !stock ||
            stock.symbol !== symbol
        ) {

            throw new Error(
                `Invalid stock state: ${symbol}`
            );

        }

    }

}


function createSessionEnvelope({
    sessionDate,
    instruments,
    state,
    cursorState
}) {

    const normalizedInstruments =
        normalizeInstruments(
            instruments
        );

    const normalizedDate =
        normalizeSessionDate(
            sessionDate
        );

    if (!normalizedDate) {

        throw new Error(
            "sessionDate is required"
        );

    }

    validateState(
        state,
        normalizedInstruments
    );

    validateCursorState(
        cursorState,
        normalizedInstruments
    );

    return {

        version:
            MULTI_STOCK_SESSION_STATE_VERSION,

        sessionDate:
            normalizedDate,

        instruments:
            normalizedInstruments,

        safety:
            SAFETY,

        state,

        cursorState

    };

}


export function createMultiStockSessionState({

    sessionDate,

    instruments

} = {}) {

    const normalizedInstruments =
        normalizeInstruments(
            instruments
        );

    const normalizedDate =
        normalizeSessionDate(
            sessionDate
        );

    if (!normalizedDate) {

        throw new Error(
            "sessionDate is required"
        );

    }

    const state =
        createMultiStockState(
            normalizedInstruments
        );

    const cursorState =
        createMultiStockForwardCursor(
            normalizedInstruments
        );

    return createSessionEnvelope({

        sessionDate:
            normalizedDate,

        instruments:
            normalizedInstruments,

        state,

        cursorState

    });

}


export function validateMultiStockSessionState(
    session,
    {
        sessionDate,
        instruments
    } = {}
) {

    if (
        !session ||
        typeof session !== "object"
    ) {

        throw new Error(
            "session is required"
        );

    }

    if (
        session.version !==
        MULTI_STOCK_SESSION_STATE_VERSION
    ) {

        throw new Error(
            "Unsupported multi-stock session state version"
        );

    }

    const normalizedInstruments =
        normalizeInstruments(
            instruments
        );

    const normalizedDate =
        normalizeSessionDate(
            sessionDate
        );

    if (!normalizedDate) {

        throw new Error(
            "sessionDate is required"
        );

    }

    if (
        session.sessionDate !==
        normalizedDate
    ) {

        throw new Error(
            "Session date does not match requested session"
        );

    }

    validateSafetyObject(
        session.safety,
        "Session"
    );

    if (
        !Array.isArray(
            session.instruments
        )
    ) {

        throw new Error(
            "Session instruments are required"
        );

    }

    const expected =
        JSON.stringify(
            normalizedInstruments
        );

    const actual =
        JSON.stringify(
            session.instruments
        );

    if (
        expected !== actual
    ) {

        throw new Error(
            "Session instrument universe does not match"
        );

    }

    validateState(
        session.state,
        normalizedInstruments
    );

    validateCursorState(
        session.cursorState,
        normalizedInstruments
    );

    return true;

}


export function saveMultiStockSessionState(
    filePath,
    session
) {

    if (
        typeof filePath !== "string" ||
        !filePath.trim()
    ) {

        throw new Error(
            "filePath is required"
        );

    }

    if (
        !session ||
        typeof session !== "object"
    ) {

        throw new Error(
            "session is required"
        );

    }

    const directory =
        path.dirname(
            filePath
        );

    fs.mkdirSync(
        directory,
        {
            recursive: true
        }
    );

    const temporaryPath =
        `${filePath}.tmp`;

    fs.writeFileSync(
        temporaryPath,
        JSON.stringify(
            session,
            null,
            2
        ),
        "utf8"
    );

    fs.renameSync(
        temporaryPath,
        filePath
    );

    return session;

}


export function loadMultiStockSessionState(
    filePath,
    {
        sessionDate,
        instruments
    } = {}
) {

    if (
        typeof filePath !== "string" ||
        !filePath.trim()
    ) {

        throw new Error(
            "filePath is required"
        );

    }

    if (
        !fs.existsSync(
            filePath
        )
    ) {

        throw new Error(
            `Session state file not found: ${filePath}`
        );

    }

    let session;

    try {

        session =
            JSON.parse(
                fs.readFileSync(
                    filePath,
                    "utf8"
                )
            );

    } catch {

        throw new Error(
            "Unable to parse multi-stock session state"
        );

    }

    validateMultiStockSessionState(
        session,
        {
            sessionDate,
            instruments
        }
    );

    return session;

}
import test from "node:test";
import assert from "node:assert/strict";

import {
    resolveEquityInstruments
} from "../../../premarket/equity-data/indstocks-equity-instrument-provider.js";

import {
    buildMultiStockUniverse
} from "./multi-stock-universe-v1.js";

import {
    runMultiStockLiveForwardAdapter
} from "./multi-stock-live-forward-adapter-v1.js";


const PMSE_URL =
    "https://trading-dashboard-sigma-ten.vercel.app/api/pmse-scan";

const INSTRUMENTS_URL =
    "https://api.indstocks.com/market/instruments?source=equity";


function requireToken(){

    const token =
        process.env.INDSTOCKS_TOKEN;

    if(
        !token ||
        token === "YOUR_TOKEN_HERE"
    ){

        throw new Error(
            "INDSTOCKS_TOKEN is required for Component 9B live smoke test"
        );

    }

    return token;

}


async function fetchPMSE(){

    const response =
        await fetch(PMSE_URL);

    assert.equal(
        response.ok,
        true,
        `PMSE endpoint failed: HTTP ${response.status}`
    );

    const data =
        await response.json();

    assert.equal(
        data.status,
        "READY"
    );

    assert.equal(
        data.output?.source,
        "PMSE"
    );

    assert.equal(
        data.output?.mode,
        "PAPER_ONLY"
    );

    assert.equal(
        data.output?.metadata?.researchOnly,
        true
    );

    assert.equal(
        data.output?.metadata?.tradeCreated,
        false
    );

    assert.equal(
        data.output?.metadata?.brokerCalled,
        false
    );

    return data;
}


async function fetchInstrumentCsv(token){

    const response =
        await fetch(
            INSTRUMENTS_URL,
            {
                method: "GET",
                headers: {
                    Authorization: token,
                    Accept: "text/csv"
                }
            }
        );

    assert.equal(
        response.ok,
        true,
        `INDstocks instrument API failed: HTTP ${response.status}`
    );

    return response.text();
}


function createSafeState(instruments){

    return {
        version: "A11-MULTI-STOCK-STATE-V1",
        mode: "PAPER_ONLY",
        researchOnly: true,
        tradingEnabled: false,
        brokerCalled: false,
        orderCreationEnabled: false,
        learningEnabled: false,
        strategyMutation: false,
        optimizationEnabled: false,
        promotionEnabled: false,
        stocks: Object.fromEntries(
            instruments.map(
                instrument => [
                    instrument.symbol,
                    {
                        symbol: instrument.symbol,
                        session: {
                            active: false,
                            sessionDate: null
                        },
                        opportunity: {
                            active: false,
                            opportunityId: null,
                            signal: null,
                            signalTimestamp: null,
                            observationCount: 0,
                            heartbeatCount: 0,
                            lifecycleState: "NOT_REACHED"
                        },
                        position: {
                            active: false,
                            side: null,
                            entry: null,
                            entryTimestamp: null,
                            stop: null,
                            target: null,
                            risk: null
                        },
                        outcome: null,
                        cooldown: {
                            remainingCandles: 0
                        }
                    }
                ]
            )
        )
    };

}


function createCursorState(instruments){

    return {
        version: "A11-MULTI-STOCK-FORWARD-CURSOR-V1",
        cursors: Object.fromEntries(
            instruments.map(
                instrument => [
                    instrument.symbol,
                    {
                        lastProcessedCandleTs: null
                    }
                ]
            )
        )
    };

}


test(
    "Component 9B live smoke test resolves and evaluates the real four-stock universe",
    async () => {

        const token =
            requireToken();

        const pmse =
            await fetchPMSE();

        const candidates =
            pmse.output.candidates;

        assert.equal(
            candidates.length,
            3
        );

        const universe =
            buildMultiStockUniverse({
                pmseCandidates: candidates
            });

        assert.equal(
            universe.instruments.length,
            4
        );

        assert.equal(
            universe.instruments[0].symbol,
            "NIFTY 50"
        );

        const csv =
            await fetchInstrumentCsv(token);

        const resolvedPMSEInstruments =
            candidates.map(
                candidate => {

                    const matches =
                        resolveEquityInstruments({
                            symbols: [
                                candidate.symbol
                            ],
                            csv
                        });

                    const nseEquity =
                        matches.find(
                            instrument =>
                                instrument.exchange ===
                                    "NSE" &&
                                instrument.segment ===
                                    "E"
                        );

                    assert.ok(
                        nseEquity,
                        `No NSE/E instrument resolved for ${candidate.symbol}`
                    );

                    return nseEquity;

                }
            );

        assert.equal(
            resolvedPMSEInstruments.length,
            3
        );

        assert.equal(
            new Set(
                resolvedPMSEInstruments.map(
                    instrument =>
                        instrument.symbol
                )
            ).size,
            3
        );

        const resolvedUniverse =
            universe.instruments.map(
                instrument => {

                    if(
                        instrument.symbol ===
                        "NIFTY 50"
                    ){

                        return instrument;

                    }

                    const resolved =
                        resolvedPMSEInstruments.find(
                            item =>
                                item.symbol ===
                                instrument.symbol
                        );

                    assert.ok(
                        resolved
                    );

                    return {
                        ...instrument,
                        securityId:
                            resolved.securityId,
                        exchange:
                            resolved.exchange,
                        segment:
                            resolved.segment
                    };

                }
            );

        assert.equal(
            resolvedUniverse.length,
            4
        );

        assert.equal(
            new Set(
                resolvedUniverse.map(
                    instrument =>
                        instrument.symbol
                )
            ).size,
            4
        );

        const result =
            await runMultiStockLiveForwardAdapter({
                pmseInput: pmse.output,
                resolvedPMSEInstruments,
                state:
                    createSafeState(
                        resolvedUniverse
                    ),
                cursorState:
                    createCursorState(
                        resolvedUniverse
                    ),
                accessToken: token,
                nowMs: Date.now()
            });

        assert.equal(
            result.mode,
            "PAPER_ONLY"
        );

        assert.equal(
            result.researchOnly,
            true
        );

        assert.equal(
            result.tradingEnabled,
            false
        );

        assert.equal(
            result.brokerCalled,
            false
        );

        assert.equal(
            result.orderCreationEnabled,
            false
        );

        assert.equal(
            result.learningEnabled,
            false
        );

        assert.equal(
            result.strategyMutation,
            false
        );

        assert.equal(
            result.optimizationEnabled,
            false
        );

        assert.equal(
            result.promotionEnabled,
            false
        );

        assert.equal(
            result.candles.stocks.length,
            4
        );

        assert.equal(
            result.evaluation.results.length,
            4
        );

        assert.equal(
            result.forward.results.length,
            4
        );

        for(
            const stock of
                result.candles.stocks
        ){

            assert.ok(
                stock.symbol
            );

            assert.ok(
                Array.isArray(
                    stock.candles
                )
            );

            assert.ok(
                stock.candles.length > 0,
                `${stock.symbol} returned no candles`
            );

            for(
                const candle of
                    stock.candles
            ){

                assert.ok(
                    Number.isFinite(
                        candle.ts
                    )
                );

                assert.ok(
                    candle.ts <
                    Date.now()
                );

            }

        }

    }
);

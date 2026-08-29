import assert from "node:assert/strict";
import test from "node:test";

import {
    createRegimeOutcomeRecord
} from "../research/regime-outcome-model.js";


const MARKET_DATE =
    "2026-08-31";


const CUTOFF =
    "2026-08-31T09:00:00+05:30";


function bullishRegime() {

    return {

        state:
            "GREEN",

        score:
            1,

        confidence:
            1,

        reasons: [

            "NIFTY 50 shows bullish session structure",

            "BANKNIFTY shows bullish session structure"

        ]

    };

}


function positiveOutcome() {

    return {

        version:
            "PMSE-M2.4-FORWARD-OUTCOME-V1",

        marketDate:
            MARKET_DATE,

        decisionCutoff:
            CUTOFF,

        sessionOpen:
            100,

        sessionClose:
            105,

        sessionHigh:
            108,

        sessionLow:
            99,

        sessionReturnPct:
            5,

        maxFavourableMovePct:
            8,

        maxAdverseMovePct:
            1,

        state:
            "POSITIVE",

        candleCount:
            75

    };

}


test(
    "M2.5 creates a regime-outcome research record",
    () => {

        const result =
            createRegimeOutcomeRecord({

                marketDate:
                    MARKET_DATE,

                cutoff:
                    CUTOFF,

                previousSessionDate:
                    "2026-08-28",

                regime:
                    bullishRegime(),

                observations: {

                    "NIFTY 50": {

                        valid:
                            true

                    },

                    BANKNIFTY: {

                        valid:
                            true

                    }

                },

                forwardOutcome:
                    positiveOutcome()

            });


        assert.equal(
            result.version,
            "PMSE-M2.5-REGIME-OUTCOME-V1"
        );


        assert.equal(
            result.marketDate,
            MARKET_DATE
        );


        assert.equal(
            result.decisionCutoff,
            CUTOFF
        );


        assert.equal(
            result.previousSessionDate,
            "2026-08-28"
        );


        assert.equal(
            result.regime.state,
            "GREEN"
        );


        assert.equal(
            result.regime.score,
            1
        );


        assert.equal(
            result.forwardOutcome.state,
            "POSITIVE"
        );


        assert.equal(
            result.forwardOutcome.sessionReturnPct,
            5
        );

    }
);


test(
    "M2.5 preserves the frozen decision boundary",
    () => {

        const result =
            createRegimeOutcomeRecord({

                marketDate:
                    MARKET_DATE,

                cutoff:
                    CUTOFF,

                previousSessionDate:
                    "2026-08-28",

                regime:
                    bullishRegime(),

                forwardOutcome:
                    positiveOutcome()

            });


        assert.equal(
            result.metadata.decisionFrozenAt,
            CUTOFF
        );


        assert.equal(
            result.metadata.futureInformationUsedForDecision,
            false
        );


        assert.equal(
            result.metadata.forwardOutcomeUsedToCreateDecision,
            false
        );


        assert.equal(
            result.metadata.regimeDecisionUsed,
            true
        );

    }
);


test(
    "M2.5 remains research-only",
    () => {

        const result =
            createRegimeOutcomeRecord({

                marketDate:
                    MARKET_DATE,

                cutoff:
                    CUTOFF,

                previousSessionDate:
                    "2026-08-28",

                regime:
                    bullishRegime(),

                forwardOutcome:
                    positiveOutcome()

            });


        assert.equal(
            result.metadata.researchOnly,
            true
        );


        assert.equal(
            result.metadata.tradeCreated,
            false
        );


        assert.equal(
            result.metadata.brokerCalled,
            false
        );


        assert.equal(
            result.metadata.productionBackendTouched,
            false
        );


        assert.equal(
            result.metadata.frontendTouched,
            false
        );

    }
);


test(
    "M2.5 rejects a missing regime",
    () => {

        assert.throws(

            () =>
                createRegimeOutcomeRecord({

                    marketDate:
                        MARKET_DATE,

                    cutoff:
                        CUTOFF,

                    forwardOutcome:
                        positiveOutcome()

                }),

            /regime is required/

        );

    }
);


test(
    "M2.5 rejects a missing forward outcome",
    () => {

        assert.throws(

            () =>
                createRegimeOutcomeRecord({

                    marketDate:
                        MARKET_DATE,

                    cutoff:
                        CUTOFF,

                    regime:
                        bullishRegime()

                }),

            /forwardOutcome is required/

        );

    }
);
import test from "node:test";
import assert from "node:assert/strict";


import {
    createTradeMindInput,
    PMSE_OUTPUT_VERSION
}
from "../output/trademind-input-contract.js";



test(
    "PMSE contract creates TradeMind input",
    () => {


        const result =
            createTradeMindInput({

                selectedCandidates:[

                    {
                        symbol:"reliance",
                        score:90,
                        newsRisk:"LOW"
                    }

                ]

            });



        assert.equal(
            result.version,
            PMSE_OUTPUT_VERSION
        );


        assert.equal(
            result.source,
            "PMSE"
        );


        assert.equal(
            result.mode,
            "PAPER_ONLY"
        );


        assert.equal(
            result.candidates[0].symbol,
            "RELIANCE"
        );


    }
);



test(
    "PMSE contract limits output to maximum three stocks",
    () => {


        const result =
            createTradeMindInput({

                selectedCandidates:[

                    {
                        symbol:"A"
                    },

                    {
                        symbol:"B"
                    },

                    {
                        symbol:"C"
                    },

                    {
                        symbol:"D"
                    }

                ]

            });



        assert.equal(
            result.candidates.length,
            3
        );


    }
);



test(
    "PMSE contract remains paper only",
    () => {


        const result =
            createTradeMindInput({

                selectedCandidates:[]

            });



        assert.equal(
            result.metadata.tradeCreated,
            false
        );


        assert.equal(
            result.metadata.brokerCalled,
            false
        );


    }
);

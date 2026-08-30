import test from "node:test";
import assert from "node:assert/strict";


import {
    rankCandidates,
    PMSE_RANKING_VERSION
}
from "../ranking/candidate-ranking-engine.js";



test(
    "PMSE ranking engine ranks highest score first",
    () => {


        const result =
            rankCandidates({

                stocks:[

                    {
                        symbol:"INFY",

                        features:{
                            priceChangePct:1,
                            volumeRatio:1,
                            range:5
                        }

                    },


                    {
                        symbol:"RELIANCE",

                        features:{
                            priceChangePct:4,
                            volumeRatio:3,
                            range:10
                        }

                    }

                ]

            });



        assert.equal(
            result.version,
            PMSE_RANKING_VERSION
        );


        assert.equal(
            result.candidates[0].symbol,
            "RELIANCE"
        );


        assert.ok(
            result.candidates[0].score >
            result.candidates[1].score
        );


    }
);



test(
    "PMSE ranking remains research-only",
    () => {


        const result =
            rankCandidates({

                stocks:[

                    {
                        symbol:"TCS",

                        features:{
                            priceChangePct:1
                        }

                    }

                ]

            });



        assert.equal(
            result.metadata.tradingEnabled,
            false
        );


        assert.equal(
            result.metadata.brokerCalled,
            false
        );


        assert.equal(
            result.metadata.signalCreated,
            false
        );


    }
);



test(
    "PMSE ranking rejects invalid input",
    () => {


        assert.throws(
            () =>
                rankCandidates({

                    stocks:"invalid"

                })
        );


    }
);

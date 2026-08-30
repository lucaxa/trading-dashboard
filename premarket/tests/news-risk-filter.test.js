import test from "node:test";
import assert from "node:assert/strict";


import {
    applyNewsRiskFilter,
    PMSE_NEWS_FILTER_VERSION
}
from "../news/news-risk-filter.js";



test(
    "PMSE news filter blocks high risk candidates",
    () => {


        const result =
            applyNewsRiskFilter({

                candidates:[

                    {
                        symbol:"RELIANCE",
                        score:90,
                        newsRisk:"LOW"
                    },


                    {
                        symbol:"ADANI",
                        score:95,
                        newsRisk:"HIGH"
                    }

                ]

            });



        assert.equal(
            result.version,
            PMSE_NEWS_FILTER_VERSION
        );


        assert.equal(
            result.approved.length,
            1
        );


        assert.equal(
            result.approved[0].symbol,
            "RELIANCE"
        );


        assert.equal(
            result.blocked.length,
            1
        );


        assert.equal(
            result.blocked[0].symbol,
            "ADANI"
        );


    }
);



test(
    "PMSE news filter keeps missing risk as low risk",
    () => {


        const result =
            applyNewsRiskFilter({

                candidates:[

                    {
                        symbol:"TCS",
                        score:80
                    }

                ]

            });



        assert.equal(
            result.approved[0].newsRisk,
            "LOW"
        );


    }
);



test(
    "PMSE news filter remains research-only",
    () => {


        const result =
            applyNewsRiskFilter({

                candidates:[

                    {
                        symbol:"INFY",
                        score:70,
                        newsRisk:"LOW"
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


    }
);

import assert from "node:assert/strict";
import test from "node:test";

import {
    buildPreMarketSnapshot
} from "../evidence/builder.js";


const CUTOFF =
    "2026-08-31T09:00:00+05:30";


test(
    "builder accepts evidence before cutoff",
    () => {

        const snapshot =
            buildPreMarketSnapshot({

                marketDate:
                    "2026-08-31",

                cutoff:
                    CUTOFF,

                evidence: [

                    {
                        source: "NSE",

                        type: "CORPORATE_EVENT",

                        symbol: "RELIANCE",

                        publishedAt:
                            "2026-08-31T08:30:00+05:30",

                        observedAt:
                            "2026-08-31T08:31:00+05:30",

                        data: {
                            event: "example"
                        }

                    }

                ]

            });


        assert.equal(
            snapshot.marketDate,
            "2026-08-31"
        );

        assert.equal(
            snapshot.corporateEvents.length,
            1
        );

        assert.equal(
            snapshot.evidence.length,
            1
        );

    }
);


test(
    "builder rejects evidence published after cutoff",
    () => {

        assert.throws(

            () =>
                buildPreMarketSnapshot({

                    marketDate:
                        "2026-08-31",

                    cutoff:
                        CUTOFF,

                    evidence: [

                        {
                            source: "NEWS_SOURCE",

                            type: "NEWS",

                            symbol: "TCS",

                            publishedAt:
                                "2026-08-31T09:05:00+05:30",

                            observedAt:
                                "2026-08-31T09:06:00+05:30"

                        }

                    ]

                }),

            /published after cutoff/

        );

    }
);


test(
    "builder removes exact duplicates deterministically",
    () => {

        const item = {

            source: "NSE",

            type: "NEWS",

            symbol: "INFY",

            publishedAt:
                "2026-08-31T08:20:00+05:30",

            observedAt:
                "2026-08-31T08:21:00+05:30",

            data: {
                headline: "Example"
            }

        };


        const snapshot =
            buildPreMarketSnapshot({

                marketDate:
                    "2026-08-31",

                cutoff:
                    CUTOFF,

                evidence: [
                    item,
                    item
                ]

            });


        assert.equal(
            snapshot.evidence.length,
            1
        );

        assert.equal(
            snapshot.news.length,
            1
        );

    }
);


test(
    "builder sorts evidence by publication time",
    () => {

        const snapshot =
            buildPreMarketSnapshot({

                marketDate:
                    "2026-08-31",

                cutoff:
                    CUTOFF,

                evidence: [

                    {
                        source: "SOURCE_B",

                        type: "NEWS",

                        symbol: "TCS",

                        publishedAt:
                            "2026-08-31T08:50:00+05:30",

                        observedAt:
                            "2026-08-31T08:51:00+05:30"

                    },

                    {
                        source: "SOURCE_A",

                        type: "NEWS",

                        symbol: "RELIANCE",

                        publishedAt:
                            "2026-08-31T08:10:00+05:30",

                        observedAt:
                            "2026-08-31T08:11:00+05:30"

                    }

                ]

            });


        assert.equal(
            snapshot.evidence[0].symbol,
            "RELIANCE"
        );

        assert.equal(
            snapshot.evidence[1].symbol,
            "TCS"
        );

    }
);


test(
    "builder fails when evidence is missing publication time",
    () => {

        assert.throws(

            () =>
                buildPreMarketSnapshot({

                    marketDate:
                        "2026-08-31",

                    cutoff:
                        CUTOFF,

                    evidence: [

                        {
                            source: "NSE",

                            type: "NEWS",

                            symbol: "HDFC"

                        }

                    ]

                }),

            /requires publishedAt/

        );

    }
);

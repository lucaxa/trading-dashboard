import assert from "node:assert/strict";
import test from "node:test";

import {
    studyHistoricalRegimes
} from "../research/regime-study.js";


test(
    "M3 separates records by regime state",
    () => {

        const result =
            studyHistoricalRegimes({

                records: [

                    {
                        regime: {
                            state: "GREEN"
                        },

                        outcome: {
                            state: "POSITIVE",
                            sessionReturnPct: 1
                        }

                    },

                    {
                        regime: {
                            state: "GREEN"
                        },

                        outcome: {
                            state: "NEGATIVE",
                            sessionReturnPct: -0.5
                        }

                    },

                    {
                        regime: {
                            state: "CAUTION"
                        },

                        outcome: {
                            state: "FLAT",
                            sessionReturnPct: 0
                        }

                    },

                    {
                        regime: {
                            state: "RED"
                        },

                        outcome: {
                            state: "NEGATIVE",
                            sessionReturnPct: -1
                        }

                    }

                ]

            });


        assert.equal(
            result.totalRecords,
            4
        );


        assert.equal(
            result.states.GREEN.records,
            2
        );


        assert.equal(
            result.states.CAUTION.records,
            1
        );


        assert.equal(
            result.states.RED.records,
            1
        );

    }
);


test(
    "M3 calculates average and median return",
    () => {

        const result =
            studyHistoricalRegimes({

                records: [

                    {
                        regime: {
                            state: "GREEN"
                        },

                        outcome: {
                            state: "POSITIVE",
                            sessionReturnPct: 2
                        }

                    },

                    {
                        regime: {
                            state: "GREEN"
                        },

                        outcome: {
                            state: "POSITIVE",
                            sessionReturnPct: 1
                        }

                    },

                    {
                        regime: {
                            state: "GREEN"
                        },

                        outcome: {
                            state: "NEGATIVE",
                            sessionReturnPct: -1
                        }

                    }

                ]

            });


        assert.equal(
            result.states.GREEN.averageReturnPct,
            2 / 3
        );


        assert.equal(
            result.states.GREEN.medianReturnPct,
            1
        );

    }
);


test(
    "M3 calculates directional positive rate",
    () => {

        const result =
            studyHistoricalRegimes({

                records: [

                    {
                        regime: {
                            state: "GREEN"
                        },

                        outcome: {
                            state: "POSITIVE",
                            sessionReturnPct: 1
                        }

                    },

                    {
                        regime: {
                            state: "GREEN"
                        },

                        outcome: {
                            state: "POSITIVE",
                            sessionReturnPct: 2
                        }

                    },

                    {
                        regime: {
                            state: "GREEN"
                        },

                        outcome: {
                            state: "NEGATIVE",
                            sessionReturnPct: -1
                        }

                    }

                ]

            });


        assert.equal(
            result.states.GREEN.positiveRatePct,
            66.66666666666666
        );

    }
);


test(
    "M3 handles empty research data",
    () => {

        const result =
            studyHistoricalRegimes();


        assert.equal(
            result.totalRecords,
            0
        );


        assert.equal(
            result.states.GREEN.records,
            0
        );


        assert.equal(
            result.states.CAUTION.records,
            0
        );


        assert.equal(
            result.states.RED.records,
            0
        );

    }
);


test(
    "M3 remains research-only",
    () => {

        const result =
            studyHistoricalRegimes({

                records: []

            });


        assert.equal(
            result.metadata.researchOnly,
            true
        );


        assert.equal(
            result.metadata.regimeRulesChanged,
            false
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
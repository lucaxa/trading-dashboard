import assert from "node:assert/strict";
import test from "node:test";

import {
    evaluateMarketRegime
} from "../regime/evaluate.js";

import {
    REGIME_STATES
} from "../regime/models.js";


const MARKET_DATE =
    "2026-08-31";


const CUTOFF =
    "2026-08-31T09:00:00+05:30";


function observation({

    valid = true,

    direction = "UP",

    sessionReturn = 0.01,

    closeLocation = 0.80

} = {}) {

    return {

        valid,

        direction,

        sessionReturn,

        closeLocation

    };

}


test(
    "M2 requires NIFTY 50 observation",
    () => {

        assert.throws(

            () =>
                evaluateMarketRegime({

                    marketDate:
                        MARKET_DATE,

                    cutoff:
                        CUTOFF,

                    observations: {

                        BANKNIFTY:
                            observation()

                    }

                }),

            /NIFTY 50 and BANKNIFTY observations are required/

        );

    }
);


test(
    "M2 requires BANKNIFTY observation",
    () => {

        assert.throws(

            () =>
                evaluateMarketRegime({

                    marketDate:
                        MARKET_DATE,

                    cutoff:
                        CUTOFF,

                    observations: {

                        "NIFTY 50":
                            observation()

                    }

                }),

            /NIFTY 50 and BANKNIFTY observations are required/

        );

    }
);


test(
    "aligned bullish indices produce GREEN",
    () => {

        const result =
            evaluateMarketRegime({

                marketDate:
                    MARKET_DATE,

                cutoff:
                    CUTOFF,

                observations: {

                    "NIFTY 50":
                        observation({

                            direction:
                                "UP",

                            sessionReturn:
                                0.01,

                            closeLocation:
                                0.80

                        }),

                    BANKNIFTY:
                        observation({

                            direction:
                                "UP",

                            sessionReturn:
                                0.012,

                            closeLocation:
                                0.75

                        })

                }

            });


        assert.equal(
            result.state,
            REGIME_STATES.GREEN
        );


        assert.equal(
            result.score,
            1
        );

    }
);


test(
    "aligned bearish indices produce RED",
    () => {

        const result =
            evaluateMarketRegime({

                marketDate:
                    MARKET_DATE,

                cutoff:
                    CUTOFF,

                observations: {

                    "NIFTY 50":
                        observation({

                            direction:
                                "DOWN",

                            sessionReturn:
                                -0.01,

                            closeLocation:
                                0.20

                        }),

                    BANKNIFTY:
                        observation({

                            direction:
                                "DOWN",

                            sessionReturn:
                                -0.012,

                            closeLocation:
                                0.25

                        })

                }

            });


        assert.equal(
            result.state,
            REGIME_STATES.RED
        );


        assert.equal(
            result.score,
            0
        );

    }
);


test(
    "mixed index direction produces CAUTION",
    () => {

        const result =
            evaluateMarketRegime({

                marketDate:
                    MARKET_DATE,

                cutoff:
                    CUTOFF,

                observations: {

                    "NIFTY 50":
                        observation({

                            direction:
                                "UP",

                            sessionReturn:
                                0.01,

                            closeLocation:
                                0.80

                        }),

                    BANKNIFTY:
                        observation({

                            direction:
                                "DOWN",

                            sessionReturn:
                                -0.01,

                            closeLocation:
                                0.20

                        })

                }

            });


        assert.equal(
            result.state,
            REGIME_STATES.CAUTION
        );


        assert.equal(
            result.score,
            0.5
        );

    }
);


test(
    "weak bullish movement remains CAUTION",
    () => {

        const result =
            evaluateMarketRegime({

                marketDate:
                    MARKET_DATE,

                cutoff:
                    CUTOFF,

                observations: {

                    "NIFTY 50":
                        observation({

                            direction:
                                "UP",

                            sessionReturn:
                                0.0005,

                            closeLocation:
                                0.80

                        }),

                    BANKNIFTY:
                        observation({

                            direction:
                                "UP",

                            sessionReturn:
                                0.0004,

                            closeLocation:
                                0.75

                        })

                }

            });


        assert.equal(
            result.state,
            REGIME_STATES.CAUTION
        );

    }
);


test(
    "invalid market observation produces RED",
    () => {

        const result =
            evaluateMarketRegime({

                marketDate:
                    MARKET_DATE,

                cutoff:
                    CUTOFF,

                observations: {

                    "NIFTY 50":
                        observation({

                            valid:
                                false

                        }),

                    BANKNIFTY:
                        observation()

                }

            });


        assert.equal(
            result.state,
            REGIME_STATES.RED
        );


        assert.equal(
            result.score,
            0
        );

    }
);


test(
    "M2 result remains research-only",
    () => {

        const result =
            evaluateMarketRegime({

                marketDate:
                    MARKET_DATE,

                cutoff:
                    CUTOFF,

                observations: {

                    "NIFTY 50":
                        observation(),

                    BANKNIFTY:
                        observation()

                }

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

import assert from "node:assert/strict";
import test from "node:test";

import {
    auditHistoricalResearch
} from "../research/research-audit.js";


function validRecord({

    marketDate = "2026-08-31",

    regimeState = "GREEN",

    outcomeState = "POSITIVE",

    sessionReturnPct = 1

} = {}) {

    return {

        marketDate,

        decisionCutoff:
            "2026-08-31T09:00:00+05:30",

        regime: {

            state:
                regimeState

        },

        forwardOutcome: {

            marketDate,

            decisionCutoff:
                "2026-08-31T09:00:00+05:30",

            state:
                outcomeState,

            sessionReturnPct

        },

        metadata: {

            researchOnly:
                true,

            decisionFrozenAt:
                "2026-08-31T09:00:00+05:30",

            futureInformationUsedForDecision:
                false,

            forwardOutcomeUsedToCreateDecision:
                false,

            tradeCreated:
                false,

            brokerCalled:
                false,

            productionBackendTouched:
                false,

            frontendTouched:
                false

        }

    };

}


test(
    "M3.6 handles empty research data",
    () => {

        const result =
            auditHistoricalResearch();


        assert.equal(
            result.totalRecords,
            0
        );


        assert.equal(
            result.auditStatus,
            "PASS"
        );

    }
);


test(
    "M3.6 accepts valid GREEN positive record",
    () => {

        const result =
            auditHistoricalResearch({

                records: [
                    validRecord()
                ]

            });


        assert.equal(
            result.auditStatus,
            "PASS"
        );


        assert.equal(
            result.totalRecords,
            1
        );


        assert.equal(
            result.validRecords,
            1
        );


        assert.equal(
            result.invalidRecords,
            0
        );

    }
);


test(
    "M3.6 accepts valid CAUTION flat record",
    () => {

        const result =
            auditHistoricalResearch({

                records: [

                    validRecord({

                        regimeState:
                            "CAUTION",

                        outcomeState:
                            "FLAT",

                        sessionReturnPct:
                            0

                    })

                ]

            });


        assert.equal(
            result.auditStatus,
            "PASS"
        );

    }
);


test(
    "M3.6 accepts valid RED negative record",
    () => {

        const result =
            auditHistoricalResearch({

                records: [

                    validRecord({

                        regimeState:
                            "RED",

                        outcomeState:
                            "NEGATIVE",

                        sessionReturnPct:
                            -1

                    })

                ]

            });


        assert.equal(
            result.auditStatus,
            "PASS"
        );

    }
);


test(
    "M3.6 allows UNKNOWN forward outcome",
    () => {

        const result =
            auditHistoricalResearch({

                records: [

                    validRecord({

                        outcomeState:
                            "UNKNOWN",

                        sessionReturnPct:
                            null

                    })

                ]

            });


        assert.equal(
            result.auditStatus,
            "PASS"
        );

    }
);


test(
    "M3.6 rejects invalid regime state",
    () => {

        const result =
            auditHistoricalResearch({

                records: [

                    validRecord({

                        regimeState:
                            "UNKNOWN"

                    })

                ]

            });


        assert.equal(
            result.auditStatus,
            "FAIL"
        );


        assert.equal(
            result.invalidRecords,
            1
        );

    }
);


test(
    "M3.6 rejects missing regime",
    () => {

        const record =
            validRecord();


        delete record.regime;


        const result =
            auditHistoricalResearch({

                records: [
                    record
                ]

            });


        assert.equal(
            result.auditStatus,
            "FAIL"
        );


        assert.equal(
            result.invalidRecords,
            1
        );

    }
);


test(
    "M3.6 rejects missing forward outcome",
    () => {

        const record =
            validRecord();


        delete record.forwardOutcome;


        const result =
            auditHistoricalResearch({

                records: [
                    record
                ]

            });


        assert.equal(
            result.auditStatus,
            "FAIL"
        );


        assert.equal(
            result.invalidRecords,
            1
        );

    }
);


test(
    "M3.6 requires decision cutoff",
    () => {

        const record =
            validRecord();


        delete record.decisionCutoff;


        const result =
            auditHistoricalResearch({

                records: [
                    record
                ]

            });


        assert.equal(
            result.auditStatus,
            "FAIL"
        );

    }
);


test(
    "M3.6 rejects future information used for decision",
    () => {

        const record =
            validRecord();


        record.metadata
            .futureInformationUsedForDecision =
            true;


        const result =
            auditHistoricalResearch({

                records: [
                    record
                ]

            });


        assert.equal(
            result.auditStatus,
            "FAIL"
        );

    }
);


test(
    "M3.6 rejects forward outcome feedback into decision",
    () => {

        const record =
            validRecord();


        record.metadata
            .forwardOutcomeUsedToCreateDecision =
            true;


        const result =
            auditHistoricalResearch({

                records: [
                    record
                ]

            });


        assert.equal(
            result.auditStatus,
            "FAIL"
        );

    }
);


test(
    "M3.6 requires research-only metadata",
    () => {

        const record =
            validRecord();


        record.metadata
            .researchOnly =
            false;


        const result =
            auditHistoricalResearch({

                records: [
                    record
                ]

            });


        assert.equal(
            result.auditStatus,
            "FAIL"
        );

    }
);


test(
    "M3.6 aggregates multiple records",
    () => {

        const result =
            auditHistoricalResearch({

                records: [

                    validRecord(),

                    validRecord({

                        regimeState:
                            "CAUTION",

                        outcomeState:
                            "FLAT",

                        sessionReturnPct:
                            0

                    }),

                    validRecord({

                        regimeState:
                            "RED",

                        outcomeState:
                            "NEGATIVE",

                        sessionReturnPct:
                            -1

                    })

                ]

            });


        assert.equal(
            result.totalRecords,
            3
        );


        assert.equal(
            result.validRecords,
            3
        );


        assert.equal(
            result.invalidRecords,
            0
        );


        assert.equal(
            result.auditStatus,
            "PASS"
        );

    }
);


test(
    "M3.6 does not modify research records",
    () => {

        const record =
            validRecord();


        const before =
            JSON.stringify(
                record
            );


        auditHistoricalResearch({

            records: [
                record
            ]

        });


        const after =
            JSON.stringify(
                record
            );


        assert.equal(
            after,
            before
        );

    }
);


test(
    "M3.6 remains research-only",
    () => {

        const result =
            auditHistoricalResearch({

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

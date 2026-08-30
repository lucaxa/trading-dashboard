/*
============================================================
TradeMind Pro
PMSE M3.6 — Historical Research Integrity Audit
============================================================

Purpose:
Audit completed historical research records before they are
used for further PMSE analysis.

M3.6 does NOT change:

    - regime rules
    - regime decisions
    - forward outcomes
    - historical records

It only checks whether the records satisfy the required
research-integrity contract.

Research only.
No trading.
No broker interaction.
No frontend.
No production backend.
No regime feedback.
No look-ahead.
============================================================
*/

import {
    REGIME_STATES
} from "../regime/models.js";

import {
    OUTCOME_STATES
} from "../outcome/models.js";


export const PMSE_RESEARCH_AUDIT_VERSION =
    "PMSE-M3.6-HISTORICAL-RESEARCH-AUDIT-V1";


const VALID_REGIME_STATES =
    new Set([
        REGIME_STATES.GREEN,
        REGIME_STATES.CAUTION,
        REGIME_STATES.RED
    ]);


const VALID_OUTCOME_STATES =
    new Set([
        OUTCOME_STATES.POSITIVE,
        OUTCOME_STATES.NEGATIVE,
        OUTCOME_STATES.FLAT,
        OUTCOME_STATES.UNKNOWN
    ]);


function auditRecord(record) {

    const failures = [];


    if (
        !record ||
        typeof record !== "object"
    ) {

        failures.push(
            "record must be an object"
        );

        return failures;

    }


    if (!record.marketDate) {

        failures.push(
            "marketDate is required"
        );

    }


    if (!record.decisionCutoff) {

        failures.push(
            "decisionCutoff is required"
        );

    }


    if (
        !record.regime ||
        typeof record.regime !== "object"
    ) {

        failures.push(
            "regime is required"
        );

    }

    else if (
        !VALID_REGIME_STATES.has(
            record.regime.state
        )
    ) {

        failures.push(
            "invalid regime state"
        );

    }


    if (
        !record.forwardOutcome ||
        typeof record.forwardOutcome !== "object"
    ) {

        failures.push(
            "forwardOutcome is required"
        );

    }

    else if (
        !VALID_OUTCOME_STATES.has(
            record.forwardOutcome.state
        )
    ) {

        failures.push(
            "invalid forward outcome state"
        );

    }


    const metadata =
        record.metadata;


    if (
        !metadata ||
        typeof metadata !== "object"
    ) {

        failures.push(
            "metadata is required"
        );

    }

    else {

        if (
            metadata.researchOnly !== true
        ) {

            failures.push(
                "researchOnly must be true"
            );

        }


        if (
            metadata.futureInformationUsedForDecision !== false
        ) {

            failures.push(
                "futureInformationUsedForDecision must be false"
            );

        }


        if (
            metadata.forwardOutcomeUsedToCreateDecision !== false
        ) {

            failures.push(
                "forwardOutcomeUsedToCreateDecision must be false"
            );

        }


        if (
            metadata.tradeCreated !== false
        ) {

            failures.push(
                "tradeCreated must be false"
            );

        }


        if (
            metadata.brokerCalled !== false
        ) {

            failures.push(
                "brokerCalled must be false"
            );

        }


        if (
            metadata.productionBackendTouched !== false
        ) {

            failures.push(
                "productionBackendTouched must be false"
            );

        }


        if (
            metadata.frontendTouched !== false
        ) {

            failures.push(
                "frontendTouched must be false"
            );

        }

    }


    return failures;

}


export function auditHistoricalResearch({

    records = []

} = {}) {

    if (
        !Array.isArray(records)
    ) {

        throw new Error(
            "records must be an array"
        );

    }


    let validRecords = 0;

    let invalidRecords = 0;


    const failures = [];


    for (
        let index = 0;
        index < records.length;
        index += 1
    ) {

        const recordFailures =
            auditRecord(
                records[index]
            );


        if (
            recordFailures.length === 0
        ) {

            validRecords += 1;

        }

        else {

            invalidRecords += 1;


            failures.push({

                index,

                reasons:
                    recordFailures

            });

        }

    }


    return {

        version:
            PMSE_RESEARCH_AUDIT_VERSION,

        auditStatus:
            invalidRecords === 0
                ? "PASS"
                : "FAIL",

        totalRecords:
            records.length,

        validRecords,

        invalidRecords,

        failures,

        metadata: {

            researchOnly:
                true,

            regimeRulesChanged:
                false,

            futureInformationUsedForDecision:
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

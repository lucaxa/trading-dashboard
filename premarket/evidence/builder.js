import {
    createPreMarketSnapshot
} from "./models.js";

import {
    validateEvidenceTimestamp
} from "./validate.js";


function evidenceKey(item) {

    return [
        item.source,
        item.type,
        item.symbol ?? "",
        item.publishedAt,
        item.observedAt
    ].join("|");

}


export function buildPreMarketSnapshot({

    marketDate,

    cutoff,

    evidence = []

} = {}) {

    if (!marketDate) {

        throw new Error(
            "marketDate is required"
        );

    }

    if (!cutoff) {

        throw new Error(
            "cutoff is required"
        );

    }

    if (!Array.isArray(evidence)) {

        throw new Error(
            "evidence must be an array"
        );

    }


    const accepted = [];

    const seen = new Set();


    for (const item of evidence) {

        validateEvidenceTimestamp(
            item,
            cutoff
        );


        const key =
            evidenceKey(item);


        if (seen.has(key)) {

            continue;

        }


        seen.add(key);

        accepted.push(item);

    }


    accepted.sort(
        (a, b) => {

            const publishedA =
                new Date(
                    a.publishedAt
                ).getTime();

            const publishedB =
                new Date(
                    b.publishedAt
                ).getTime();


            if (
                publishedA !==
                publishedB
            ) {

                return (
                    publishedA -
                    publishedB
                );

            }


            return evidenceKey(a)
                .localeCompare(
                    evidenceKey(b)
                );

        }
    );


    const snapshot =
        createPreMarketSnapshot({

            marketDate,

            cutoff

        });


    snapshot.evidence =
        accepted;


    for (const item of accepted) {

        if (
            item.type ===
            "NEWS"
        ) {

            snapshot.news.push(
                item
            );

        }

        else if (
            item.type ===
            "CORPORATE_EVENT"
        ) {

            snapshot.corporateEvents.push(
                item
            );

        }

        else if (
            item.type ===
            "MARKET_CONTEXT"
        ) {

            snapshot.marketContext.push(
                item
            );

        }

        else if (
            item.type ===
            "SECTOR_CONTEXT"
        ) {

            snapshot.sectorContext.push(
                item
            );

        }

        else if (
            item.type ===
            "GLOBAL_CONTEXT"
        ) {

            snapshot.globalContext.push(
                item
            );

        }

        else if (
            item.type ===
            "UNIVERSE"
        ) {

            snapshot.universe.push(
                item
            );

        }

    }


    return snapshot;

}

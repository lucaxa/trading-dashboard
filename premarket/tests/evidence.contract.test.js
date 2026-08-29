import assert from "node:assert/strict";
import test from "node:test";

import {
    createEvidenceItem,
    createPreMarketSnapshot
} from "../evidence/models.js";

import {
    validateEvidenceTimestamp
} from "../evidence/validate.js";


const CUTOFF =
    "2026-08-31T09:00:00+05:30";


test(
    "evidence records publication and observation timestamps",
    () => {

        const item =
            createEvidenceItem({

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

            });

        assert.equal(
            item.source,
            "NSE"
        );

        assert.equal(
            item.publishedAt,
            "2026-08-31T08:30:00+05:30"
        );

        assert.equal(
            item.observedAt,
            "2026-08-31T08:31:00+05:30"
        );

    }
);


test(
    "evidence published before cutoff is accepted",
    () => {

        const item =
            createEvidenceItem({

                source: "NSE",

                type: "NEWS",

                publishedAt:
                    "2026-08-31T08:45:00+05:30",

                observedAt:
                    "2026-08-31T08:50:00+05:30"

            });

        assert.equal(
            validateEvidenceTimestamp(
                item,
                CUTOFF
            ),
            true
        );

    }
);


test(
    "evidence published after cutoff is rejected",
    () => {

        const item =
            createEvidenceItem({

                source: "NSE",

                type: "NEWS",

                publishedAt:
                    "2026-08-31T09:15:00+05:30",

                observedAt:
                    "2026-08-31T09:20:00+05:30"

            });

        assert.throws(
            () =>
                validateEvidenceTimestamp(
                    item,
                    CUTOFF
                ),
            /published after cutoff/
        );

    }
);


test(
    "pre-market snapshot is empty by default",
    () => {

        const snapshot =
            createPreMarketSnapshot({

                marketDate:
                    "2026-08-31",

                cutoff:
                    CUTOFF

            });

        assert.deepEqual(
            snapshot.news,
            []
        );

        assert.deepEqual(
            snapshot.corporateEvents,
            []
        );

        assert.deepEqual(
            snapshot.universe,
            []
        );

        assert.equal(
            snapshot.metadata
                .informationCutoffEnforced,
            true
        );

    }
);

import assert from "node:assert/strict";
import test from "node:test";

import {
    PREMARKET_CONFIG
} from "../config.js";

import {
    createEmptySelection
} from "../models.js";

import {
    runPreMarketSelection
} from "../index.js";


test(
    "PMSE config is research-only",
    () => {

        assert.equal(
            PREMARKET_CONFIG.MODE,
            "RESEARCH"
        );

        assert.equal(
            PREMARKET_CONFIG.ALLOW_ORDER_EXECUTION,
            false
        );

        assert.equal(
            PREMARKET_CONFIG.ALLOW_BROKER_ACCESS,
            false
        );

        assert.equal(
            PREMARKET_CONFIG.ALLOW_TRADE_MANAGEMENT,
            false
        );

    }
);


test(
    "PMSE allows zero candidates",
    () => {

        assert.equal(
            PREMARKET_CONFIG.MIN_CANDIDATES,
            0
        );

        assert.equal(
            PREMARKET_CONFIG.REQUIRE_CANDIDATE,
            false
        );

    }
);


test(
    "empty selection has no candidates",
    () => {

        const result =
            createEmptySelection();

        assert.deepEqual(
            result.candidates,
            []
        );

        assert.equal(
            result.selectionStatus,
            "NOT_READY"
        );

    }
);


test(
    "engine does not create trades",
    () => {

        const result =
            runPreMarketSelection();

        assert.ok(
            result
        );

        assert.deepEqual(
            result.candidates,
            []
        );

        assert.equal(
            PREMARKET_CONFIG.ALLOW_ORDER_EXECUTION,
            false
        );

    }
);

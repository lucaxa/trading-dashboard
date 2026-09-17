/*
============================================================
A11 Multi-Stock Paper Session Controller
Isolated frontend contract test
============================================================
*/

import test from "node:test";
import assert from "node:assert/strict";

const MODULE_URL =
    "../../frontend/v2/multi-stock-paper-session.js";


function createLocalStorage() {

    const store = new Map();

    return {

        getItem(key) {
            return store.has(key)
                ? store.get(key)
                : null;
        },

        setItem(key, value) {
            store.set(
                key,
                String(value)
            );
        },

        removeItem(key) {
            store.delete(key);
        },

        clear() {
            store.clear();
        }
    };
}


test(
    "multi-stock paper session controller exposes isolated public API",
    async () => {

        globalThis.localStorage =
            createLocalStorage();

        globalThis.window = {};

        globalThis.fetch =
            async () => {

                throw new Error(
                    "fetch should not run during contract-only import"
                );
            };

        const module =
            await import(
                `${MODULE_URL}?test=${Date.now()}`
            );

        assert.equal(
            typeof module.startSession,
            "function"
        );

        assert.equal(
            typeof module.pollSession,
            "function"
        );

        assert.equal(
            typeof module.getSessionSnapshot,
            "function"
        );

        assert.equal(
            module.getSessionSnapshot(),
            null
        );
    }
);


test(
    "multi-stock paper session uses a dedicated storage key",
    async () => {

        globalThis.localStorage =
            createLocalStorage();

        globalThis.window = {};

        globalThis.fetch =
            async () => {

                throw new Error(
                    "fetch should not run during storage contract test"
                );
            };

        await import(
            `${MODULE_URL}?storage=${Date.now()}`
        );

        assert.equal(
            localStorage.getItem(
                "trademind_a11_paper_session_v1"
            ),
            null
        );

        assert.equal(
            localStorage.getItem(
                "trademind_a11_multi_stock_paper_session_v1"
            ),
            null
        );
    }
);


import test from "node:test";
import assert from "node:assert/strict";


import {
    getPMSEUniverse
}
from "../scanner/pmse-universe-provider.js";



test(
"PMSE universe provider creates stock list",
()=>{


    const result =
        getPMSEUniverse();


    assert.equal(
        result.universe.totalSymbols,
        10
    );


    assert.ok(
        result.universe.symbols.includes(
            "RELIANCE"
        )
    );


});



test(
"PMSE universe provider remains research only",
()=>{


    const result =
        getPMSEUniverse();


    assert.equal(
        result.metadata.tradingEnabled,
        false
    );


});

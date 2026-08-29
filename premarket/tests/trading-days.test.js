import assert from "node:assert/strict";
import test from "node:test";

import {
    isWeekend,
    isNSEHoliday,
    isTradingDay,
    previousTradingDay
} from "../calendar/trading-days.js";


test(
    "Saturday is not a trading day",
    () => {

        assert.equal(
            isWeekend("2026-08-15"),
            true
        );

        assert.equal(
            isTradingDay("2026-08-15"),
            false
        );

    }
);


test(
    "Sunday is not a trading day",
    () => {

        assert.equal(
            isWeekend("2026-08-30"),
            true
        );

        assert.equal(
            isTradingDay("2026-08-30"),
            false
        );

    }
);


test(
    "ordinary weekday is a trading day",
    () => {

        assert.equal(
            isWeekend("2026-08-28"),
            false
        );

        assert.equal(
            isTradingDay("2026-08-28"),
            true
        );

    }
);


test(
    "NSE holiday is not a trading day",
    () => {

        assert.equal(
            isNSEHoliday("2026-08-26"),
            true
        );

        assert.equal(
            isTradingDay("2026-08-26"),
            false
        );

    }
);


test(
    "Monday resolves to Friday",
    () => {

        assert.equal(
            previousTradingDay(
                "2026-08-31"
            ),
            "2026-08-28"
        );

    }
);


test(
    "day after holiday resolves to previous trading day",
    () => {

        assert.equal(
            previousTradingDay(
                "2026-08-27"
            ),
            "2026-08-25"
        );

    }
);


test(
    "holiday followed by weekend skips all non-trading days",
    () => {

        assert.equal(
            previousTradingDay(
                "2026-08-31",
                {
                    "2026-08-28":
                        "Test holiday"
                }
            ),
            "2026-08-27"
        );

    }
);


test(
    "calendar rejects missing date",
    () => {

        assert.equal(
            isTradingDay(""),
            false
        );

    }
);


test(
    "previous trading day can use an injected calendar",
    () => {

        const customHolidays = {

            "2026-08-28":
                "Injected holiday",

            "2026-08-27":
                "Injected holiday"

        };


        assert.equal(
            previousTradingDay(
                "2026-08-31",
                customHolidays
            ),
            "2026-08-26"
        );

    }
);

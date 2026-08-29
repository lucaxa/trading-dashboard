import assert from "node:assert/strict";
import test from "node:test";

import {
    MARKET_SESSION,
    classifyCandleSession,
    filterRegularSessionCandles,
    filterPreMarketInformation
} from "../market/session.js";


function istTimestamp(
    value
) {

    return Math.floor(
        new Date(value).getTime() /
        1000
    );

}


test(
    "market session uses Asia/Kolkata",
    () => {

        assert.equal(
            MARKET_SESSION.timezone,
            "Asia/Kolkata"
        );

        assert.equal(
            MARKET_SESSION.open,
            "09:15"
        );

        assert.equal(
            MARKET_SESSION.close,
            "15:30"
        );

    }
);


test(
    "09:15 candle is regular session",
    () => {

        const ts =
            istTimestamp(
                "2026-08-31T09:15:00+05:30"
            );

        assert.equal(
            classifyCandleSession(ts),
            "REGULAR_SESSION"
        );

    }
);


test(
    "09:00 is pre-market",
    () => {

        const ts =
            istTimestamp(
                "2026-08-31T09:00:00+05:30"
            );

        assert.equal(
            classifyCandleSession(ts),
            "PRE_MARKET"
        );

    }
);


test(
    "15:30 belongs to the regular-session boundary",
    () => {

        const ts =
            istTimestamp(
                "2026-08-31T15:30:00+05:30"
            );

        assert.equal(
            classifyCandleSession(ts),
            "REGULAR_SESSION"
        );

    }
);


test(
    "15:31 is post-market",
    () => {

        const ts =
            istTimestamp(
                "2026-08-31T15:31:00+05:30"
            );

        assert.equal(
            classifyCandleSession(ts),
            "POST_MARKET"
        );

    }
);


test(
    "regular session filter excludes another date",
    () => {

        const candles = [

            {
                ts:
                    istTimestamp(
                        "2026-08-30T10:00:00+05:30"
                    )
            },

            {
                ts:
                    istTimestamp(
                        "2026-08-31T10:00:00+05:30"
                    )

            }

        ];


        const result =
            filterRegularSessionCandles(
                candles,
                "2026-08-31"
            );


        assert.equal(
            result.length,
            1
        );

    }
);


test(
    "regular session filter excludes pre-market and post-market",
    () => {

        const candles = [

            {
                ts:
                    istTimestamp(
                        "2026-08-31T09:00:00+05:30"
                    )
            },

            {
                ts:
                    istTimestamp(
                        "2026-08-31T10:00:00+05:30"
                    )
            },

            {
                ts:
                    istTimestamp(
                        "2026-08-31T15:31:00+05:30"
                    )
            }

        ];


        const result =
            filterRegularSessionCandles(
                candles,
                "2026-08-31"
            );


        assert.equal(
            result.length,
            1
        );

    }
);


test(
    "pre-market filter accepts information at cutoff",
    () => {

        const cutoff =
            "2026-08-31T09:00:00+05:30";


        const result =
            filterPreMarketInformation(

                [

                    {
                        publishedAt:
                            "2026-08-31T09:00:00+05:30"
                    }

                ],

                cutoff

            );


        assert.equal(
            result.length,
            1
        );

    }
);


test(
    "pre-market filter rejects information after cutoff",
    () => {

        const cutoff =
            "2026-08-31T09:00:00+05:30";


        const result =
            filterPreMarketInformation(

                [

                    {
                        publishedAt:
                            "2026-08-31T09:01:00+05:30"
                    }

                ],

                cutoff

            );


        assert.equal(
            result.length,
            0
        );

    }
);


test(
    "regular session candles are chronological",
    () => {

        const candles = [

            {
                ts:
                    istTimestamp(
                        "2026-08-31T12:00:00+05:30"
                    )
            },

            {
                ts:
                    istTimestamp(
                        "2026-08-31T10:00:00+05:30"
                    )
            }

        ];


        const result =
            filterRegularSessionCandles(
                candles,
                "2026-08-31"
            );


        assert.equal(
            result[0].ts <
            result[1].ts,
            true
        );

    }
);

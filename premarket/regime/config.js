export const PMSE_REGIME_CONFIG = Object.freeze({

    VERSION:
        "PMSE-M2.2-REGIME-V1",

    /*
     * These thresholds define structural evidence.
     *
     * They are NOT profitability thresholds.
     * They are intentionally conservative and
     * must later be validated against historical
     * outcomes.
     */

    MIN_DIRECTIONAL_RETURN:
        0.001,

    MIN_CLOSE_LOCATION_UP:
        0.60,

    MAX_CLOSE_LOCATION_DOWN:
        0.40,

    REQUIRED_SYMBOLS: Object.freeze([

        "NIFTY 50",

        "BANKNIFTY"

    ]),

    RESEARCH_ONLY:
        true,

    CREATE_TRADES:
        false,

    CALL_BROKER:
        false

});

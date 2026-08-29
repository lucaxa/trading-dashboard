export const PREMARKET_CONFIG = Object.freeze({

    VERSION: "PMSE-V1",

    MODE: "RESEARCH",

    MARKET: "NSE",

    TIMEZONE: "Asia/Kolkata",

    // Initial research cutoff.
    // This is a contract value and can be changed only through
    // an explicit research revision.
    PREMARKET_CUTOFF: "09:00",

    MIN_CANDIDATES: 0,

    MAX_CANDIDATES: 3,

    // No forced selection.
    REQUIRE_CANDIDATE: false,

    // The existing trade backend remains the execution authority.
    ALLOW_ORDER_EXECUTION: false,

    ALLOW_BROKER_ACCESS: false,

    ALLOW_TRADE_MANAGEMENT: false,

    // Historical research must enforce timestamp availability.
    ENFORCE_INFORMATION_CUTOFF: true

});

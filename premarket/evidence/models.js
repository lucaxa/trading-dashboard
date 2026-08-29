export const PMSE_EVIDENCE_VERSION = "PMSE-EVIDENCE-V1";

export function createEvidenceItem({
    source,
    type,
    symbol = null,
    publishedAt = null,
    observedAt = null,
    data = null
} = {}) {

    return {
        source,
        type,
        symbol,
        publishedAt,
        observedAt,
        data
    };

}

export function createPreMarketSnapshot({
    marketDate = null,
    cutoff = null
} = {}) {

    return {
        version: PMSE_EVIDENCE_VERSION,

        marketDate,

        cutoff,

        marketContext: [],

        universe: [],

        news: [],

        corporateEvents: [],

        sectorContext: [],

        globalContext: [],

        evidence: [],

        metadata: {
            informationCutoffEnforced: true,
            createdAt: new Date().toISOString()
        }
    };

}
